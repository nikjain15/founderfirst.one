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

/** Entries with their lines (and each line's account) embedded in one query. */
export function useEntries(orgId: string | undefined) {
  return useQuery({
    queryKey: ["ledger-entries", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<JournalEntry[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("journal_entries")
        .select(
          "id,entry_date,memo,status,source,source_ref,reverses_id,created_at," +
            "lines:journal_lines(id,account_id,amount_minor,currency,side,memo," +
            "account:ledger_accounts(code,name,type))",
        )
        .eq("org_id", orgId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as JournalEntry[];
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

// ── write-path (Edge Functions) ──────────────────────────────────────────────
async function invoke<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
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

/** A client-side idempotency key for a money mutation (replays are de-duped). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}
