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
        .select("org_id,cpa_posts_require_approval,home_currency,fiscal_year_start_month")
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
}) => invoke<{ settings: OrgAccountingSettings }>("org-settings", { op: "set", ...input });

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

// ── external accounting connections (QBO/Xero) ────────────────────────────────
export type ExternalProvider = "qbo" | "xero";
export interface ExternalConnection {
  id: string;
  provider: ExternalProvider;
  tenant_name: string | null;
  status: "pending" | "active" | "revoked" | "error";
}

export function useConnections(orgId: string | undefined) {
  return useQuery({
    queryKey: ["external-connections", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ExternalConnection[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("external_connections")
        .select("id,provider,tenant_name,status")
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

/** A client-side idempotency key for a money mutation (replays are de-duped). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}
