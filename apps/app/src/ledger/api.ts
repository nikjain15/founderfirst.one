/**
 * Ledger data access. READS go straight to Supabase under the caller's scoped JWT
 * — RLS (Phase 2) isolates tenants, so a query can only ever return rows the user
 * is permitted to see. WRITES go through the typed Edge-Function write-path
 * (ledger-entries / ledger-reverse / ledger-accounts / ledger-periods), never a
 * direct table write (ARCHITECTURE.md §6.1, §8) — those tables deny client writes.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "../lib/supabase";
import type { AccountType, AccountingPeriod, JournalEntry, LedgerAccount } from "./types";
import type { TaxBasis } from "./estimatedTax";
import type { NecVendorRow } from "./reports";

// ── reads ───────────────────────────────────────────────────────────────────
export function useAccounts(orgId: string | undefined) {
  return useQuery({
    queryKey: ["ledger-accounts", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<LedgerAccount[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("ledger_accounts")
        .select("id,code,name,type,parent_id,currency,is_archived")
        .eq("org_id", orgId)
        .order("type")
        .order("code", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LedgerAccount[];
    },
  });
}

export function usePeriods(orgId: string | undefined) {
  return useQuery({
    queryKey: ["ledger-periods", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<AccountingPeriod[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("accounting_periods")
        .select("id,period_start,period_end,status,closed_at")
        .eq("org_id", orgId)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AccountingPeriod[];
    },
  });
}

const ENTRY_SELECT =
  "id,entry_date,memo,status,source,source_ref,reverses_id,created_at," +
  "lines:journal_lines(id,account_id,amount_minor,currency,side,memo," +
  "account:ledger_accounts(code,name,type))";

// PostgREST caps any single response at `max_rows` (1000 on prod). Reports
// (trial balance / P&L / balance sheet) are derived from the FULL entry list
// (ARCHITECTURE.md §6.5), so a one-shot select silently truncates the books for
// any org past 1000 entries — and because every entry is internally balanced,
// the truncated reports still *tie to the cent*, just to the WRONG number (the
// dropped rows are the oldest: opening balances, capital injections). Page
// through every entry so the books are complete. Most orgs fit in one page.
const ENTRY_PAGE = 1000;
const MAX_ENTRY_PAGES = 1000; // 1M-entry safety stop; far beyond pilot scale

/** Entries with their lines (and each line's account) embedded — all pages. */
export function useEntries(orgId: string | undefined) {
  return useQuery({
    queryKey: ["ledger-entries", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<JournalEntry[]> => {
      const sb = getClient();
      const all: JournalEntry[] = [];
      for (let page = 0; page < MAX_ENTRY_PAGES; page++) {
        const from = page * ENTRY_PAGE;
        const { data, error } = await sb
          .from("journal_entries")
          .select(ENTRY_SELECT)
          .eq("org_id", orgId)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }) // total order → stable across pages
          .range(from, from + ENTRY_PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as unknown as JournalEntry[];
        all.push(...rows);
        if (rows.length < ENTRY_PAGE) return all;
      }
      throw new Error("ledger-entries: exceeded the maximum page count");
    },
  });
}

/** Invalidate every ledger query for an org after a successful write. */
export function useLedgerRefresh(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    for (const key of ["ledger-accounts", "ledger-periods", "ledger-entries"]) {
      void qc.invalidateQueries({ queryKey: [key, orgId] });
    }
  };
}

// ── categorization (Phase 4) ─────────────────────────────────────────────────
export interface UncategorizedEntry {
  entry_id: string;
  entry_date: string;
  memo: string | null;
  source: string;
  source_ref: string | null;
  line_id: string;
  amount_minor: number;
  side: "D" | "C";
  currency: string;
  from_account_id: string;
  created_at: string;
}

/** Posted entries still sitting on the Uncategorized holding account. */
export function useUncategorized(orgId: string | undefined) {
  return useQuery({
    queryKey: ["uncategorized", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<UncategorizedEntry[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("list_uncategorized_entries", { p_org: orgId });
      if (error) throw error;
      return (data ?? []) as UncategorizedEntry[];
    },
  });
}

export interface CategoryProposal {
  account_id: string;
  code: string | null;
  name: string;
  type: string;
  confidence: number;
  rationale: string;
  source: "rule" | "penny";
}

/** Penny's grounded suggestion for one uncategorized entry. */
export const proposeCategory = (org_id: string, entry_id: string) =>
  invoke<{ from_account_id: string; proposal: CategoryProposal | null; note?: string }>(
    "categorize", { op: "propose", org_id, entry_id },
  );

/** Approve a category — reverses + reposts onto the chosen account and learns it. */
export const approveCategory = (
  org_id: string, entry_id: string, to_account_id: string, learn_value?: string | null,
) =>
  invoke<{ entry: JournalEntry }>(
    "categorize", { op: "approve", org_id, entry_id, to_account_id, learn: true, learn_value: learn_value ?? null },
  );

/** Invalidate the uncategorized queue (after an approve). */
export function useUncategorizedRefresh(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ["uncategorized", orgId] }); };
}

// ── W3.2 trust-tiered autonomy ────────────────────────────────────────────────
// One server-authoritative call per uncategorized entry decides the tier (cutoffs
// + the ≤5-asks/week budget from platform_config): HIGH auto-posts (Penny did
// this), MEDIUM returns for the batch queue, LOW returns a card (income + spent-
// budget defer to the digest). The feed + undo reuse the reversal path.

export type Tier = "high" | "medium" | "low" | "digest";
export interface TriageResult {
  tier: Tier;
  proposal: CategoryProposal | null;
  variant?: "low_confidence";
  reason?: "income" | "budget_spent";
  spent?: number;
  budget?: number;
  activity?: PennyActivity;
  note?: string;
}

/** Decide + act on one uncategorized entry's tier (server-authoritative). */
export const triageEntry = (org_id: string, entry_id: string) =>
  invoke<TriageResult>("categorize", { op: "triage", org_id, entry_id });

export interface PennyActivity {
  id: string;
  org_id: string;
  kind: string;
  entry_id: string | null;
  account_id: string | null;
  source: "rule" | "vendor_prior" | "penny";
  confidence: number;
  summary: string;
  undo_entry_id: string | null;
  undone_at: string | null;
  created_at: string;
}

/** The "Penny did this" feed for an org (RLS-scoped read). */
export function usePennyActivity(orgId: string | undefined) {
  return useQuery({
    queryKey: ["penny-activity", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<PennyActivity[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("list_penny_activity", { p_org: orgId, p_limit: 50 });
      if (error) throw error;
      return (data ?? []) as PennyActivity[];
    },
  });
}

/** 1-tap undo of one auto-post — reverses the reposted entry (ledger stays balanced). */
export const undoActivity = (org_id: string, activity_id: string) =>
  invoke<{ activity: PennyActivity }>("categorize", { op: "undo", org_id, activity_id });

export function usePennyActivityRefresh(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ["penny-activity", orgId] }); };
}

/** The owner's interruption budget for this week (spent / cap / remaining). */
export function useAskBudget(orgId: string | undefined) {
  return useQuery({
    queryKey: ["ask-budget", orgId],
    enabled: Boolean(orgId),
    staleTime: 30_000,
    queryFn: async (): Promise<{ spent: number; budget: number; remaining: number }> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("owner_asks_this_week", { p_org: orgId });
      if (error) throw error;
      // The cap comes from config (CENTRAL-1); the app reads it via useBehaviorConfig.
      // We only return the raw spent here; the caller folds in the config budget.
      const spent = Number(data ?? 0);
      return { spent, budget: 0, remaining: 0 };
    },
  });
}
export function useAskBudgetRefresh(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ["ask-budget", orgId] }); };
}

// ── Penny thread (W3.1) — grounded Q&A on the real books ──────────────────────
// The client computes the number optimistically from the SAME paginated entries
// the reports use (thread.ts computeMetric → ties to the cent) for a snappy UI, and
// MAY pass it as a hint — but the penny-thread fn is AUTHORITATIVE (P2-1): it
// re-routes the question and re-computes the fact from the org's ledger server-side,
// and its figure wins. A client-forged amount is discarded. Records to ai_decisions.
export interface ThreadFact {
  metric: "spend" | "income" | "net" | "cash";
  amount_minor: number;
  category_label: string | null;
  period_label: string;
}

/** Ask Penny a grounded books question. `fact` is an optimistic client hint only —
 *  the server re-routes + re-computes and its answer is authoritative. */
export const askPennyThread = (org_id: string, question: string, fact: ThreadFact | null) =>
  invoke<{ text: string; declined?: boolean; fact_stated?: string }>(
    "penny-thread", { op: "answer", org_id, question, fact },
  );

// ── learned-rules management (W1.6) ───────────────────────────────────────────
// Owner + full-access CPA see every rule Penny has learned and can delete a bad
// one. Reads go direct under RLS (categorization_rules is client-readable via
// can_access_org); the delete goes through the categorize edge fn write-path
// (deactivate_categorization_rule RPC, audit-logged). match_value is always
// LITERAL text here — never a LIKE pattern — so the CAT-F4 ESCAPE hardening in the
// matcher is untouched.
export interface LearnedRule {
  id: string;
  match_type: "description_exact" | "description_contains" | "source_ref_exact";
  match_value: string;
  account_id: string;
  account: { code: string | null; name: string } | null;
  source: string;         // 'human' | 'penny'
  times_applied: number;
  created_at: string;
}

/**
 * Normalize a PostgREST learned-rules row: the embedded `account` comes back as
 * an object, an array, or null depending on the join shape — flatten it to a
 * single account or null. Exported for unit testing (pure, no client).
 */
export function normalizeLearnedRule(row: unknown): LearnedRule {
  const r = row as Omit<LearnedRule, "account"> & {
    account: { code: string | null; name: string } | { code: string | null; name: string }[] | null;
  };
  const acc = Array.isArray(r.account) ? (r.account[0] ?? null) : r.account;
  return { ...r, account: acc } as LearnedRule;
}

/** Every ACTIVE learned rule for an org, busiest first, with its target account. */
export function useLearnedRules(orgId: string | undefined) {
  return useQuery({
    queryKey: ["learned-rules", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<LearnedRule[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("categorization_rules")
        .select("id, match_type, match_value, account_id, source, times_applied, created_at, account:ledger_accounts(code, name)")
        .eq("org_id", orgId!)
        .eq("is_active", true)
        .order("times_applied", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown[]).map(normalizeLearnedRule);
    },
  });
}

/** Delete (deactivate) a learned rule — Penny stops applying it. Audit-logged. */
export const deleteRule = (org_id: string, rule_id: string) =>
  invoke<{ rule: LearnedRule }>("categorize", { op: "delete_rule", org_id, rule_id });

/** Invalidate the learned-rules list (after a delete). */
export function useLearnedRulesRefresh(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ["learned-rules", orgId] }); };
}

// ── write-path (Edge Functions) ──────────────────────────────────────────────
// Exported so every caller surfaces the function's friendly {error} body instead
// of Supabase's generic "non-2xx status code" message.
export async function invoke<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const sb = getClient();
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    // FunctionsHttpError carries the Response; our functions return {error,code}.
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        if (j?.error) detail = String(j.error);
      } catch { /* fall back to error.message */ }
    }
    throw new Error(detail);
  }
  return data as T;
}

export interface PostLineInput {
  account_id: string;
  amount_minor: number;
  side: "D" | "C";
  memo?: string | null;
}
export interface PostEntryInput {
  org_id: string;
  entry_date: string;
  idempotency_key: string;
  lines: PostLineInput[];
  memo?: string | null;
  source?: string;
  source_ref?: string | null;
}

export const postEntry = (input: PostEntryInput) =>
  invoke<{ entry: JournalEntry }>("ledger-entries", { op: "post", ...input });

export const approveEntry = (org_id: string, entry_id: string) =>
  invoke<{ entry: JournalEntry }>("ledger-entries", { op: "approve", org_id, entry_id });

export const reverseEntry = (input: {
  org_id: string;
  entry_id: string;
  idempotency_key: string;
  entry_date?: string | null;
  memo?: string | null;
}) => invoke<{ entry: JournalEntry }>("ledger-reverse", input);

export const upsertAccount = (input: {
  org_id: string;
  name: string;
  type: AccountType;
  code?: string | null;
  id?: string | null;
  parent_id?: string | null;
  currency?: string | null;
  archived?: boolean | null;
}) => invoke<{ account: LedgerAccount }>("ledger-accounts", input);

export const setPeriod = (org_id: string, period_id: string, action: "close" | "reopen") =>
  invoke<{ period: AccountingPeriod }>("ledger-periods", { org_id, period_id, action });

// ── org accounting settings (owner control: CPA approval gate) ───────────────
export interface OrgAccountingSettings {
  org_id: string;
  cpa_posts_require_approval: boolean;
  home_currency: string;
  fiscal_year_start_month: number;
  multi_currency_enabled: boolean;
  mfa_required: boolean;
}

/** The owner's accounting settings for an org (RLS-readable to anyone who can
 *  access the org; only the owner may write via setOrgSettings). */
export function useOrgSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: ["org-settings", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<OrgAccountingSettings | null> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("org_accounting_settings")
        .select("org_id,cpa_posts_require_approval,home_currency,fiscal_year_start_month,multi_currency_enabled,mfa_required")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as OrgAccountingSettings | null;
    },
  });
}

export const setOrgSettings = (input: {
  org_id: string;
  cpa_posts_require_approval?: boolean;
  home_currency?: string;
  fiscal_year_start_month?: number;
  multi_currency_enabled?: boolean;
  mfa_required?: boolean;
}) => invoke<{ settings: OrgAccountingSettings }>("org-settings", { op: "set", ...input });

// ── currency catalog (W5.4 — reference data, global not org-scoped) ──────────
export interface Currency { code: string; name: string; minor_unit: number; }

/** The seeded ISO-4217 catalog (supabase/migrations/20260707060000). Global
 *  reference data, cached hard (it changes about as often as the ISO list does). */
export function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    staleTime: Infinity,
    queryFn: async (): Promise<Currency[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("currencies")
        .select("code,name,minor_unit")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return (data ?? []) as Currency[];
    },
  });
}

// ── history import (Phase 3) ──────────────────────────────────────────────────
export type ImportSource = "csv" | "bank_statement" | "trial_balance" | "opening_balances";

export interface ImportBatch {
  id: string;
  org_id: string;
  source: ImportSource;
  status: "draft" | "previewed" | "committed" | "discarded";
  filename: string | null;
  bank_account_id: string | null;
  cutover_date: string | null;
}
export interface StagedRow {
  row_num: number;
  raw?: Record<string, unknown>;
  txn_date?: string | null;
  description?: string | null;
  amount_minor?: number | null;
  account_id?: string | null;
  side?: "D" | "C" | null;
  status?: "pending" | "ready" | "error" | "skipped";
}

export const createImportBatch = (input: {
  org_id: string;
  source: ImportSource;
  filename?: string | null;
  bank_account_id?: string | null;
  cutover_date?: string | null;
}) => invoke<{ result: ImportBatch }>("imports", { op: "create", ...input });

export const addImportRows = (org_id: string, batch_id: string, rows: StagedRow[]) =>
  invoke<{ result: number }>("imports", { op: "add_rows", org_id, batch_id, rows });

export const commitImportBatch = (org_id: string, batch_id: string) =>
  invoke<{ result: ImportBatch }>("imports", { op: "commit", org_id, batch_id });

export const discardImportBatch = (org_id: string, batch_id: string) =>
  invoke<{ result: ImportBatch }>("imports", { op: "discard", org_id, batch_id });

// ── connector registry (CENTRAL-2) — platform knowledge, public-read ─────────
// The commerce provider list for the payout-upload surface comes from HERE, not
// a hardcoded array: adding PayPal/Square/Amazon is a registry row, no UI change
// (centralization). status 'available' = usable now; 'planned'/'beta' = shown as
// coming-soon. logo_ref is a design-system asset id (never an inline URL).
export interface Connector {
  key: string;
  name: string;
  category: string;
  logo_ref: string | null;
  capabilities: string[];
  status: "available" | "beta" | "planned";
  sort_order: number;
}

export function useConnectors(category?: string) {
  return useQuery({
    queryKey: ["connectors", category ?? "all"],
    queryFn: async (): Promise<Connector[]> => {
      const sb = getClient();
      let q = sb
        .from("connectors")
        .select("key,name,category,logo_ref,capabilities,status,sort_order")
        .order("sort_order");
      if (category) q = q.eq("category", category);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Connector[];
    },
  });
}

// ── e-commerce payout splitting (W4.1) — posts a split payout via the RPC ─────
export interface PayoutPostInput {
  org_id: string;
  provider: string;
  payout_id: string;
  payout_date: string;
  bank_account_id: string;
  gross_minor: number;
  fees_minor?: number;
  refunds_minor?: number;
  adjust_minor?: number;
  net_minor?: number | null;
  currency?: string | null;
  memo?: string | null;
}

/** Post a split payout. `duplicate:true` = the payout was already imported (no double-post). */
export const postEcommercePayout = (input: PayoutPostInput) =>
  invoke<{ entry: JournalEntry; duplicate: boolean }>("payouts", { op: "post", ...input });

/** Reverse a previously-imported payout (the correction path for a restated report). */
export const reverseEcommercePayout = (input: {
  org_id: string; provider: string; payout_id: string; date?: string; memo?: string;
}) => invoke<{ entry: JournalEntry }>("payouts", { op: "reverse", ...input });

// ── external accounting connections (QBO/Xero) ────────────────────────────────
export type ExternalProvider = "qbo" | "xero";
// Plaid is a bank-feed connection (link-token flow, not OAuth redirect); it shares
// the external_connections table but not the ${provider}-connect/-import fns.
export type ConnectionProvider = ExternalProvider | "plaid";
export interface ExternalConnection {
  id: string;
  provider: ConnectionProvider;
  tenant_name: string | null;
  status: "pending" | "active" | "revoked" | "error";
  /** Last failure reason from the provider (e.g. `invalid_grant`) when status='error'. */
  last_error: string | null;
}

export function useConnections(orgId: string | undefined) {
  return useQuery({
    queryKey: ["external-connections", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ExternalConnection[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("external_connections")
        .select("id,provider,tenant_name,status,last_error")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExternalConnection[];
    },
  });
}

export const connectProvider = (provider: ExternalProvider, org_id: string) =>
  invoke<{ authorize_url: string }>(`${provider}-connect`, { org_id });

export const importProvider = (provider: ExternalProvider, org_id: string, connection_id: string) =>
  invoke<{ batch_id: string; accounts: number; rows: number; ready: number }>(
    `${provider}-import`, { org_id, connection_id },
  );

// ── W2.2 provider migration (one-click, with history) ─────────────────────────
export interface ProviderTbRow { name: string; debit_minor: number; credit_minor: number; }
export interface ProviderMigration {
  id: string;
  org_id: string;
  connection_id: string;
  provider: ExternalProvider;
  status: "pulling" | "review" | "committed" | "discarded";
  cutover_date: string | null;
  batch_ids: string[];
  accounts: number;
  txn_count: number;
  provider_tb: ProviderTbRow[];
  provider_tb_as_of: string | null;
}

/** Kick off a full historical pull: CoA + every txn → per-year batches + QBO TB snapshot. */
export const migrateProvider = (provider: ExternalProvider, org_id: string, connection_id: string) =>
  invoke<{
    migration_id: string; batch_ids: string[]; accounts: number; txn_count: number;
    years: string[]; provider_tb_rows: number; provider_tb_as_of: string | null;
  }>(`${provider}-import`, { org_id, connection_id, historical: true });

/** The migration records for an org (RLS-readable). Newest first. */
export function useProviderMigrations(orgId: string | undefined) {
  return useQuery({
    queryKey: ["provider-migrations", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ProviderMigration[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("provider_migrations")
        .select("id,org_id,connection_id,provider,status,cutover_date,batch_ids,accounts,txn_count,provider_tb,provider_tb_as_of")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProviderMigration[];
    },
  });
}

/** Confirm the migration's cutover date (stamps every batch + marks committed). */
export const setMigrationCutover = (org_id: string, migration_id: string, cutover_date: string) =>
  invoke<{ migration: ProviderMigration }>("imports", { op: "migration_cutover", org_id, migration_id, cutover_date });

// ── Plaid bank feeds (W2.3) ───────────────────────────────────────────────────
// The access token never touches the client: link-token → open Plaid Link →
// exchange the public_token server-side (stores the connection + initial sync).
export interface PlaidSyncResult { added: number; modified: number; removed: number; skipped: number; }

export const plaidLinkToken = (org_id: string) =>
  invoke<{ link_token: string; expiration: string }>("plaid-link-token", { org_id });

export const plaidExchange = (org_id: string, public_token: string) =>
  invoke<PlaidSyncResult & { connection_id: string; tenant_name: string | null }>(
    "plaid-exchange", { org_id, public_token },
  );

export const plaidSync = (org_id: string, connection_id: string) =>
  invoke<PlaidSyncResult>("plaid-sync", { org_id, connection_id });

// ── report exports (W1.2) ─────────────────────────────────────────────────────
// The file is built + downloaded client-side (export.ts); this records ONE audit
// row per export (who / which report / period / when). Fire-and-forget from the
// UI: a logging failure must never block the download the user already got.
export const logReportExport = (input: {
  org_id: string;
  report: "tb" | "pnl" | "bs" | "gl" | "cf" | "nec" | "pkg";
  format: "csv" | "pdf";
  scope?: { start?: string | null; end?: string | null };
  filename?: string;
  rows?: number;
}) => invoke<{ ok: true }>("report-export", input);

// ── bank reconciliation (W1.1) ────────────────────────────────────────────────
// Reads go straight to Supabase under the scoped JWT (RLS: members + engaged CPAs
// see their own rows only). Writes go through the `reconcile` edge fn → the
// service_role-only match RPCs (a read-only CPA is refused server-side).
export type ReconciliationStatus = "open" | "locked";
export type ReconciliationMatchKind = "exact" | "fuzzy" | "manual";

export interface ReconciliationSession {
  id: string;
  org_id: string;
  account_id: string;
  period_id: string | null;
  statement_end: string;
  opening_minor: number;
  closing_minor: number;
  status: ReconciliationStatus;
  locked_at: string | null;
}

export interface ReconciliationMatchRow {
  id: string;
  session_id: string;
  import_row_id: string;
  entry_id: string;
  kind: ReconciliationMatchKind;
  amount_minor: number;
  reopened_at: string | null;
}

/** A statement line to reconcile — one committed/staged import_rows row. */
export interface ImportStatementRow {
  id: string;
  txn_date: string | null;
  description: string | null;
  amount_minor: number | null;
}

/** Reconciliation sessions for an account, newest statement first. */
export function useReconciliationSessions(orgId: string | undefined, accountId: string | undefined) {
  return useQuery({
    queryKey: ["reconciliation-sessions", orgId, accountId],
    enabled: Boolean(orgId && accountId),
    queryFn: async (): Promise<ReconciliationSession[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("reconciliation_sessions")
        .select("id,org_id,account_id,period_id,statement_end,opening_minor,closing_minor,status,locked_at")
        .eq("org_id", orgId)
        .eq("account_id", accountId)
        .order("statement_end", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReconciliationSession[];
    },
  });
}

/** Confirmed (live) matches within a session. */
export function useReconciliationMatches(orgId: string | undefined, sessionId: string | undefined) {
  return useQuery({
    queryKey: ["reconciliation-matches", orgId, sessionId],
    enabled: Boolean(orgId && sessionId),
    queryFn: async (): Promise<ReconciliationMatchRow[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("reconciliation_matches")
        .select("id,session_id,import_row_id,entry_id,kind,amount_minor,reopened_at")
        .eq("org_id", orgId)
        .eq("session_id", sessionId)
        .is("reopened_at", null);
      if (error) throw error;
      return (data ?? []) as ReconciliationMatchRow[];
    },
  });
}

// Statement lines feed the reconciliation tie-out, so this is a report-feeding
// select and MUST NOT truncate at PostgREST max_rows (1000 on prod) — a partial
// statement can still falsely "tie" (LEARNINGS: RPTTEST). Page through every row.
const STATEMENT_PAGE = 1000;
const MAX_STATEMENT_PAGES = 1000; // 1M-row safety stop; far beyond pilot scale

/**
 * Statement lines for ONE bank account — committed CSV/bank-statement import rows.
 * The bank side lives on `import_batches.bank_account_id`; `import_rows.account_id`
 * is the contra/category, so we scope by the parent batch's bank account via an
 * inner-join filter (`import_batches!inner`). Filtering only by `org_id` would
 * pull OTHER accounts' lines into the reconciliation (wrong-account contamination).
 * All pages load — reconciliation needs the complete statement.
 */
// Exported for unit test: proves the account filter + full pagination. `sb` is
// the (untyped) Supabase client; the caller passes getClient().
export async function fetchStatementRows(
  sb: ReturnType<typeof getClient>, orgId: string, accountId: string,
): Promise<ImportStatementRow[]> {
  const all: ImportStatementRow[] = [];
  for (let page = 0; page < MAX_STATEMENT_PAGES; page++) {
    const from = page * STATEMENT_PAGE;
    const { data, error } = await sb
      .from("import_rows")
      .select("id,txn_date,description,amount_minor,import_batches!inner(bank_account_id)")
      .eq("org_id", orgId)
      .eq("import_batches.bank_account_id", accountId)
      .not("amount_minor", "is", null)
      .order("txn_date", { ascending: true })
      .order("id", { ascending: true }) // total order → stable across pages
      .range(from, from + STATEMENT_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as ImportStatementRow[];
    all.push(...rows.map((r) => ({
      id: r.id, txn_date: r.txn_date, description: r.description, amount_minor: r.amount_minor,
    })));
    if (rows.length < STATEMENT_PAGE) return all;
  }
  throw new Error("statement-rows: exceeded the maximum page count");
}

export function useStatementRows(orgId: string | undefined, accountId: string | undefined) {
  return useQuery({
    queryKey: ["statement-rows", orgId, accountId],
    enabled: Boolean(orgId && accountId),
    queryFn: () => fetchStatementRows(getClient(), orgId as string, accountId as string),
  });
}

/**
 * The owner's read-only reconciliation summary for Home — most recent locked
 * session per org. Owners never reconcile; they just see "Reconciled ✓" and when.
 */
export function useReconciliationStatus(orgId: string | undefined) {
  return useQuery({
    queryKey: ["reconciliation-status", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<{ lockedCount: number; latestLockedAt: string | null }> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("reconciliation_sessions")
        .select("locked_at,status")
        .eq("org_id", orgId)
        .eq("status", "locked")
        .order("locked_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as { locked_at: string | null }[];
      return { lockedCount: rows.length, latestLockedAt: rows[0]?.locked_at ?? null };
    },
  });
}

export const openReconciliation = (input: {
  org_id: string; account_id: string; statement_end: string;
  opening_minor?: number; closing_minor?: number; period_id?: string | null;
}) => invoke<{ result: ReconciliationSession }>("reconcile", { op: "open", ...input });

export const matchReconciliation = (input: {
  org_id: string; session_id: string; import_row_id: string; entry_id: string;
  kind?: ReconciliationMatchKind;
}) => invoke<{ result: ReconciliationMatchRow }>("reconcile", { op: "match", ...input });

export const unmatchReconciliation = (org_id: string, match_id: string) =>
  invoke<{ result: null }>("reconcile", { op: "unmatch", org_id, match_id });

export const lockReconciliation = (org_id: string, session_id: string) =>
  invoke<{ result: ReconciliationSession }>("reconcile", { op: "lock", org_id, session_id });

export const reopenReconciliation = (org_id: string, session_id: string) =>
  invoke<{ result: ReconciliationSession }>("reconcile", { op: "reopen", org_id, session_id });

/** Invalidate every reconciliation query for an org after a write. */
export function useReconciliationRefresh(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    for (const key of ["reconciliation-sessions", "reconciliation-matches", "statement-rows"]) {
      void qc.invalidateQueries({ queryKey: [key, orgId] });
    }
  };
}

// ── coming-up filing deadlines (W3.4, reads CENTRAL-2 kernel) ─────────────────
// The deadlines are NEVER hardcoded in the app — they come from the knowledge
// kernel's `upcoming_filing_deadlines(org, as_of, horizon)` RPC (CENTRAL-2), which
// resolves the org's (jurisdiction, entity) against the effective-dated
// `filing_obligations` seed. Change a seed row → Home moves, no code edit. The RPC
// is security-definer + granted to `authenticated`; it returns [] for an org with
// no tax profile set yet (onboarding populates entity_type), so Home degrades to
// "nothing coming up" rather than erroring.
export interface FilingDeadline {
  obligation_key: string;
  kind: string;            // 'return' | 'estimate' | 'info_return' | 'extension' …
  form_code: string | null;
  label: string;
  due_date: string;        // YYYY-MM-DD
  days_until: number;
  citation: string | null;
}

/** Filing deadlines due within `horizonDays` for an org, from the kernel calendar. */
export function useUpcomingDeadlines(orgId: string | undefined, horizonDays = 90) {
  return useQuery({
    queryKey: ["upcoming-deadlines", orgId, horizonDays],
    enabled: Boolean(orgId),
    staleTime: 60_000,
    queryFn: async (): Promise<FilingDeadline[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("upcoming_filing_deadlines", {
        p_org_id: orgId, p_horizon_days: horizonDays,
      });
      if (error) throw error;
      return (data ?? []) as FilingDeadline[];
    },
  });
}

// ── estimated quarterly tax (W2.4) ────────────────────────────────────────────
// The rate params + org tax profile come from the kernel via the grounded
// estimated_tax_basis RPC (tax_jurisdictions.params, year-keyed, LAW-DERIVED). The
// estimate itself is computed in the app (estimatedTax.ts) from the same paginated
// ledger the Reports tab renders — no rate is ever hardcoded in TS.

/** The tax basis (entity + jurisdiction + resolved year params) for an org. */
export function useEstimatedTaxBasis(orgId: string | undefined, taxYear: number) {
  return useQuery({
    queryKey: ["estimated-tax-basis", orgId, taxYear],
    enabled: Boolean(orgId),
    staleTime: 60_000,
    queryFn: async (): Promise<TaxBasis | null> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("estimated_tax_basis", {
        p_org_id: orgId,
        p_tax_year: taxYear,
      });
      if (error) throw error;
      const row = (data ?? [])[0] as
        | { entity_type: string | null; jurisdiction_code: string; currency: string; params: unknown }
        | undefined;
      if (!row) return null;
      return {
        entity_type: row.entity_type,
        jurisdiction_code: row.jurisdiction_code,
        currency: row.currency,
        params: (row.params ?? {}) as TaxBasis["params"],
      };
    },
  });
}

// ── catch-up mode (W2.1) ──────────────────────────────────────────────────────
// The guided multi-year flow ORCHESTRATES import / categorize / reconcile / export
// (all reused above); these calls are the catch-up-specific write-path. Reads
// (progress, plan) and writes (set_plan, batch_approve) go through the `catch-up`
// edge fn → the service_role-only, audited RPCs (progress reads under the same fn).

/** One backlog year's progress, derived from the ledger (no denormalized status). */
export interface CatchUpYear {
  year: number;
  entries: number;
  uncategorized: number;
  reconciled_sessions: number;
  done: boolean;
}

/** Flat-per-year packaging for a catch-up (the model behind "priced per year"). */
export interface CatchUpPlan {
  org_id: string;
  fee_per_year_minor: number;
  currency: string;
  backlog_years: number[];
  fee_total_minor: number;
  status: "draft" | "active" | "complete";
}

/** One bulk-approve item — the owner accepting Penny's high-confidence pick. */
export interface BatchApproveItem {
  entry_id: string;
  to_account_id: string;
  confidence: number;
  learn_value?: string | null;
}

export interface BatchApproveResult {
  approved: number;
  skipped: number;
  failed: number;
  results: { entry_id: string; status: "approved" | "skipped" | "failed"; detail?: string }[];
}

/** The catch-up plan for an org (RLS-readable to anyone who can access the org). */
export function useCatchUpPlan(orgId: string | undefined) {
  return useQuery({
    queryKey: ["catch-up-plan", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<CatchUpPlan | null> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("catch_up_plans")
        .select("org_id,fee_per_year_minor,currency,backlog_years,fee_total_minor,status")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CatchUpPlan | null;
    },
  });
}

/** Per-year progress meter (uncategorized / reconciled counts, done flag). */
export function useCatchUpProgress(orgId: string | undefined) {
  return useQuery({
    queryKey: ["catch-up-progress", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<CatchUpYear[]> => {
      const { years } = await invoke<{ years: CatchUpYear[] }>("catch-up", { op: "progress", org_id: orgId });
      return years ?? [];
    },
  });
}

/** Set the flat-per-year packaging for this catch-up. */
export const setCatchUpPlan = (input: {
  org_id: string; fee_per_year_minor: number; backlog_years: number[]; currency?: string;
}) => invoke<{ plan: CatchUpPlan }>("catch-up", { op: "set_plan", ...input });

/** Bulk-approve high-confidence picks in one action (low-confidence → skipped). */
export const batchApproveCatchUp = (org_id: string, items: BatchApproveItem[]) =>
  invoke<BatchApproveResult>("catch-up", { op: "batch_approve", org_id, items });

/** Invalidate catch-up + downstream ledger queries after a batch approve. */
export function useCatchUpRefresh(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    for (const key of ["catch-up-progress", "catch-up-plan", "uncategorized",
      "ledger-entries", "learned-rules"]) {
      void qc.invalidateQueries({ queryKey: [key, orgId] });
    }
  };
}

/** A client-side idempotency key for a money mutation (replays are de-duped). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

// ── Receipts (W3.5) ───────────────────────────────────────────────────────────
export interface Receipt {
  id: string;
  org_id: string;
  capture_kind: "photo" | "text";
  storage_path: string | null;
  vendor: string | null;
  amount_minor: number | null;
  receipt_date: string | null;
  raw_text: string | null;
  status: "unmatched" | "attached" | "dismissed";
  entry_id: string | null;
  match_kind: "exact" | "fuzzy" | "manual" | null;
  confidence: number | null;
  created_at: string;
}
export interface ReceiptMatchCandidate {
  entry_id: string;
  entry_date: string | null;
  memo: string | null;
  amount_minor: number | null;
  match_kind: "exact" | "fuzzy";
  date_delta: number;
  confidence: number;
}
export interface CaptureResult {
  receipt: Receipt;
  match: { entry_id: string; kind: "exact" | "fuzzy"; dateDelta: number } | null;
  tier: "high" | "medium" | "low" | "unmatched";
  activity?: unknown;
  card?: boolean;
  candidate?: ReceiptMatchCandidate;
  note?: string;
}

/** The short queue of receipts that haven't been matched to a transaction yet. */
export function useUnmatchedReceipts(orgId: string | undefined) {
  return useQuery({
    queryKey: ["receipts-unmatched", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Receipt[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("list_unmatched_receipts", { p_org: orgId });
      if (error) throw error;
      return (data ?? []) as Receipt[];
    },
  });
}

/** Attached receipts for the org, keyed by entry — hydrates the row indicator. */
export function useAttachedReceipts(orgId: string | undefined) {
  return useQuery({
    queryKey: ["receipts-attached", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Record<string, Receipt>> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("list_attached_receipts", { p_org: orgId });
      if (error) throw error;
      const byEntry: Record<string, Receipt> = {};
      for (const r of (data ?? []) as Receipt[]) if (r.entry_id) byEntry[r.entry_id] = r;
      return byEntry;
    },
  });
}

/** Invalidate every receipt query (and the feed) after a capture / attach / detach. */
export function useReceiptsRefresh(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    for (const key of ["receipts-unmatched", "receipts-attached", "penny-activity", "ledger-entries"]) {
      void qc.invalidateQueries({ queryKey: [key, orgId] });
    }
  };
}

/** Capture a receipt (photo base64 or pasted text) → parse + match + tier. */
export const captureReceipt = (input: {
  org_id: string;
  capture_kind: "photo" | "text";
  image_base64?: string;
  mime?: string;
  raw_text?: string;
}) => invoke<CaptureResult>("receipts", { op: "capture", ...input });

/** Owner confirms / re-points a receipt at a transaction (manual attach). */
export const attachReceipt = (org_id: string, receipt_id: string, entry_id: string) =>
  invoke<{ receipt: Receipt }>("receipts", { op: "attach", org_id, receipt_id, entry_id });

/** 1-tap undo of a receipt link (the ledger entry is untouched). */
export const detachReceipt = (org_id: string, receipt_id: string) =>
  invoke<{ receipt: Receipt }>("receipts", { op: "detach", org_id, receipt_id });

/** Discard a receipt that documents nothing. */
export const dismissReceipt = (org_id: string, receipt_id: string) =>
  invoke<{ receipt: Receipt }>("receipts", { op: "dismiss", org_id, receipt_id });

/** A short-lived signed URL to view the private receipt asset. */
export const receiptSignedUrl = (org_id: string, receipt_id: string) =>
  invoke<{ url: string | null }>("receipts", { op: "signed_url", org_id, receipt_id });

// ── 1099 contractor tracking (card W2.5) ──────────────────────────────────────
export interface Vendor {
  id: string;
  name: string;
  is_1099_eligible: boolean;
  legal_name: string | null;
  tax_id_type: "ein" | "ssn" | null;
  tax_id_last4: string | null;
  address: string | null;
  w9_on_file: boolean;
  is_archived: boolean;
}

export interface PaymentMethod {
  key: string;
  label: string;
  nec_reportable: boolean;
  sort_order: number;
}

/** The org's active vendors (RLS-scoped read). */
export function useVendors(orgId: string | undefined) {
  return useQuery({
    queryKey: ["vendors", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Vendor[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("vendors").select("*").eq("org_id", orgId).eq("is_archived", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });
}

/** The payment-method taxonomy (reference data; the NEC exclusion is a flag). */
export function usePaymentMethods() {
  return useQuery({
    queryKey: ["payment-methods"],
    queryFn: async (): Promise<PaymentMethod[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("payment_methods").select("key,label,nec_reportable,sort_order")
        .eq("is_active", true).order("sort_order");
      if (error) throw error;
      return (data ?? []) as PaymentMethod[];
    },
  });
}

/** The year-end 1099-NEC summary rows for a tax year (server-computed). */
export function useNecSummary(orgId: string | undefined, taxYear: number) {
  return useQuery({
    queryKey: ["nec-summary", orgId, taxYear],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<NecVendorRow[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("ninetynine_nec_summary", {
        p_org: orgId, p_tax_year: taxYear,
      });
      if (error) throw error;
      return (data ?? []) as NecVendorRow[];
    },
  });
}

export function useNecRefresh(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    for (const key of ["vendors", "nec-summary", "ledger-entries"]) {
      void qc.invalidateQueries({ queryKey: [key, orgId] });
    }
  };
}

/** Create or update a per-org vendor (1099 flag + W-9 fields). */
export const upsertVendor = (input: {
  org_id: string;
  vendor_id?: string | null;
  name: string;
  is_1099_eligible: boolean;
  legal_name?: string | null;
  tax_id_type?: "ein" | "ssn" | null;
  tax_id_last4?: string | null;
  address?: string | null;
  w9_on_file?: boolean;
}) => invoke<{ result: Vendor }>("nec-tracking", { op: "vendor_upsert", ...input });

export const archiveVendor = (org_id: string, vendor_id: string) =>
  invoke<{ result: Vendor }>("nec-tracking", { op: "vendor_archive", org_id, vendor_id });

/** Attribute a posted entry to a vendor + payment method (1099 tagging). */
export const tagEntryVendor = (
  org_id: string, entry_id: string, vendor_id: string, payment_method_key: string,
) => invoke("nec-tracking", { op: "tag_entry", org_id, entry_id, vendor_id, payment_method_key });

export const untagEntryVendor = (org_id: string, entry_id: string) =>
  invoke("nec-tracking", { op: "untag_entry", org_id, entry_id });

// ── Invoicing + AR (W4.3) ─────────────────────────────────────────────────────
// Opt-in, off by default. Reads go direct under RLS (can_access_org); every write
// funnels through the `invoicing` edge fn (service_role RPCs), which posts the
// AR/revenue/cash ledger entries and — on send/nudge — emails via the shared
// email infra. The nudge cadence is DATA (platform_config), read via
// useBehaviorConfig, never hardcoded here.
export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "void";

export interface InvoiceLineInput {
  description: string;
  quantity_milli?: number;    // qty × 1000 (3dp); defaults to 1000 (= 1)
  unit_price_minor: number;
}
export interface Invoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  customer_name: string;
  customer_email: string | null;
  issue_date: string;
  due_date: string;
  currency: string;
  memo: string | null;
  total_minor: number;
  amount_paid_minor: number;
  sent_at: string | null;
  last_nudge_at: string | null;
}
export interface InvoicingSettings { enabled: boolean; nudges_enabled: boolean; }
export interface ArAgingBucket { bucket: string; invoice_count: number; balance_minor: number; }

/** The org's invoicing opt-in flags (defaults off when no row exists). */
export function useInvoicingSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: ["invoicing-settings", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<InvoicingSettings> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("org_invoicing_settings").select("enabled, nudges_enabled")
        .eq("org_id", orgId!).maybeSingle();
      if (error) throw error;
      return { enabled: Boolean(data?.enabled), nudges_enabled: Boolean(data?.nudges_enabled) };
    },
  });
}

/** Every invoice for the org, newest first. */
export function useInvoices(orgId: string | undefined) {
  return useQuery({
    queryKey: ["invoices", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Invoice[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("invoices")
        .select("id, number, status, customer_name, customer_email, issue_date, due_date, currency, memo, total_minor, amount_paid_minor, sent_at, last_nudge_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });
}

/** AR aging buckets (0-30 / 31-60 / 61-90 / 90+) over open balances. */
export function useArAging(orgId: string | undefined) {
  return useQuery({
    queryKey: ["ar-aging", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ArAgingBucket[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("invoice_ar_aging", { p_org: orgId });
      if (error) throw error;
      return (data ?? []) as ArAgingBucket[];
    },
  });
}

export function useInvoicingRefresh(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    for (const key of ["invoices", "ar-aging", "invoicing-settings", "ledger-entries"]) {
      void qc.invalidateQueries({ queryKey: [key, orgId] });
    }
  };
}

export const setInvoicingSettings = (org_id: string, patch: Partial<InvoicingSettings>) =>
  invoke<{ settings: InvoicingSettings }>("invoicing", { op: "settings", org_id, ...patch });

export const upsertInvoice = (input: {
  org_id: string; invoice_id?: string | null;
  customer_name: string; customer_email?: string | null;
  due_date?: string | null; issue_date?: string | null;
  currency?: string | null; memo?: string | null;
  revenue_account_id?: string | null; lines: InvoiceLineInput[];
}) => invoke<{ invoice: Invoice }>("invoicing", { op: "upsert", ...input });

export const sendInvoice = (org_id: string, invoice_id: string) =>
  invoke<{ invoice: Invoice; emailed: boolean }>("invoicing", { op: "send", org_id, invoice_id });

export const payInvoice = (
  org_id: string, invoice_id: string, amount_minor: number, method?: string, paid_date?: string,
  fx_rate?: number,
) => invoke<{ invoice: Invoice }>("invoicing", { op: "pay", org_id, invoice_id, amount_minor, method, paid_date, fx_rate });

export const voidInvoice = (org_id: string, invoice_id: string, memo?: string) =>
  invoke<{ invoice: Invoice }>("invoicing", { op: "void", org_id, invoice_id, memo });

/** Send AR reminders to overdue opt-in invoices at the config cadence. */
export const runInvoiceNudges = (org_id: string) =>
  invoke<{ nudged: number; cadence: number }>("invoicing", { op: "nudge", org_id });

// ── AP / bill-pay — TRACKING ONLY (RV2-D1) ────────────────────────────────────
// The money-OUT half, symmetric with invoicing. Opt-in, off by default. Records
// what the org OWES and RECORDS payments as bookkeeping entries — it NEVER moves
// money (no payments provider, no transfer API). Reads go direct under RLS
// (can_access_org); every write funnels through the `bill-pay` edge fn
// (service_role RPCs), which posts the Expense/AP/Cash ledger entries. Vendors
// are the EXISTING 1099 vendor store (useVendors above) — one source, no dup.
export type BillStatus = "draft" | "open" | "partial" | "paid" | "void";

export interface BillLineInput {
  description: string;
  quantity_milli?: number;    // qty × 1000 (3dp); defaults to 1000 (= 1)
  unit_price_minor: number;
}
export interface Bill {
  id: string;
  number: string;
  status: BillStatus;
  vendor_id: string | null;
  vendor_name_cache: string | null;
  bill_date: string;
  due_date: string;
  currency: string;
  memo: string | null;
  total_minor: number;
  amount_paid_minor: number;
  entered_at: string | null;
}
export interface ApSettings { enabled: boolean; }
export interface ApAgingBucket { bucket: string; bill_count: number; balance_minor: number; }

/** The org's AP opt-in flag (defaults off when no row exists). */
export function useApSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: ["ap-settings", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ApSettings> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("org_ap_settings").select("enabled")
        .eq("org_id", orgId!).maybeSingle();
      if (error) throw error;
      return { enabled: Boolean(data?.enabled) };
    },
  });
}

/** Every bill for the org, newest first. */
export function useBills(orgId: string | undefined) {
  return useQuery({
    queryKey: ["bills", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Bill[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("bills")
        .select("id, number, status, vendor_id, vendor_name_cache, bill_date, due_date, currency, memo, total_minor, amount_paid_minor, entered_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Bill[];
    },
  });
}

/** AP aging buckets (current / 1-30 / 31-60 / 61-90 / 90+) over open balances. */
export function useApAging(orgId: string | undefined) {
  return useQuery({
    queryKey: ["ap-aging", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ApAgingBucket[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("bill_ap_aging", { p_org: orgId });
      if (error) throw error;
      return (data ?? []) as ApAgingBucket[];
    },
  });
}

export function useApRefresh(orgId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    for (const key of ["bills", "ap-aging", "ap-settings", "ledger-entries"]) {
      void qc.invalidateQueries({ queryKey: [key, orgId] });
    }
  };
}

export const setApSettings = (org_id: string, patch: Partial<ApSettings>) =>
  invoke<{ settings: ApSettings }>("bill-pay", { op: "settings", org_id, ...patch });

export const upsertBill = (input: {
  org_id: string; bill_id?: string | null;
  vendor_id?: string | null;
  due_date?: string | null; bill_date?: string | null;
  currency?: string | null; memo?: string | null;
  expense_account_id?: string | null; lines: BillLineInput[];
}) => invoke<{ bill: Bill }>("bill-pay", { op: "upsert", ...input });

export const enterBill = (org_id: string, bill_id: string) =>
  invoke<{ bill: Bill }>("bill-pay", { op: "enter", org_id, bill_id });

/** RECORD a payment against a bill (books a Dr AP / Cr Cash entry). Moves NO money. */
export const recordBillPayment = (
  org_id: string, bill_id: string, amount_minor: number, method?: string, paid_date?: string,
) => invoke<{ bill: Bill }>("bill-pay", { op: "pay", org_id, bill_id, amount_minor, method, paid_date });

export const voidBill = (org_id: string, bill_id: string, memo?: string) =>
  invoke<{ bill: Bill }>("bill-pay", { op: "void", org_id, bill_id, memo });
