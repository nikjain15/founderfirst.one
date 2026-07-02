/**
 * CPA collaboration data access (card W1.5). WRITES go through the cpa-collab Edge
 * Function (service_role RPCs; actor from the verified JWT) — never a direct table
 * write. READS go straight to Supabase under RLS (can_access_org gates every row).
 *
 * The four primitives: flag / note / suggest-reclass / add-txn. The owner side:
 * a suggestion is a trust-tiered "needs-a-look" item (MEDIUM tier, status
 * pending_review) the owner approves — on approve the reclass recategorizes the
 * entry AND learns a rule, or the add-txn posts. Nothing posts without approval.
 */
import { useQuery } from "@tanstack/react-query";
import { getClient } from "../lib/supabase";
import { invoke, type PostLineInput } from "./api";

export type SuggestionKind = "reclass" | "add_txn";
export type SuggestionStatus = "pending_review" | "approved" | "rejected";

export interface CpaSuggestion {
  id: string;
  org_id: string;
  kind: SuggestionKind;
  status: SuggestionStatus;
  entry_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  entry_date: string | null;
  lines: PostLineInput[] | null;
  memo: string | null;
  note: string | null;
  suggested_by: string;
  resulting_entry_id: string | null;
  created_at: string;
}

export interface EntryActivity {
  kind: "flag" | "note";
  id: string;
  body: string | null;
  status: string | null;
  actor: string;
  created_at: string;
}

// ── writes (Edge Function) ────────────────────────────────────────────────────
export const flagEntry = (org_id: string, entry_id: string, reason?: string | null) =>
  invoke<{ result: unknown }>("cpa-collab", { op: "flag", org_id, entry_id, reason: reason ?? null });

export const resolveFlag = (org_id: string, flag_id: string) =>
  invoke<{ result: unknown }>("cpa-collab", { op: "resolve_flag", org_id, flag_id });

export const addNote = (org_id: string, entry_id: string, body: string) =>
  invoke<{ result: unknown }>("cpa-collab", { op: "note", org_id, entry_id, body });

export const suggestReclass = (
  org_id: string, entry_id: string, from_account_id: string, to_account_id: string, note?: string | null,
) =>
  invoke<{ result: unknown }>("cpa-collab", {
    op: "suggest_reclass", org_id, entry_id, from_account_id, to_account_id, note: note ?? null,
  });

export const addTransaction = (input: {
  org_id: string; entry_date: string; lines: PostLineInput[]; memo?: string | null; note?: string | null;
}) => invoke<{ result: unknown }>("cpa-collab", { op: "add_txn", ...input });

export const approveSuggestion = (org_id: string, suggestion_id: string) =>
  invoke<{ result: CpaSuggestion }>("cpa-collab", { op: "approve", org_id, suggestion_id });

export const rejectSuggestion = (org_id: string, suggestion_id: string, note?: string | null) =>
  invoke<{ result: CpaSuggestion }>("cpa-collab", { op: "reject", org_id, suggestion_id, note: note ?? null });

// ── reads (RLS-gated RPCs) ────────────────────────────────────────────────────
/** The owner's pending trust-tiered suggestions for one org (needs-a-look feed). */
export function usePendingSuggestions(orgId: string | undefined) {
  return useQuery({
    queryKey: ["cpa-suggestions", orgId, "pending_review"],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<CpaSuggestion[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("list_cpa_suggestions", {
        p_org: orgId, p_status: "pending_review",
      });
      if (error) throw error;
      return (data ?? []) as CpaSuggestion[];
    },
  });
}

/** Flags + notes on one entry (the collaboration thread). */
export function useEntryActivity(orgId: string | undefined, entryId: string | undefined) {
  return useQuery({
    queryKey: ["entry-activity", orgId, entryId],
    enabled: Boolean(orgId && entryId),
    queryFn: async (): Promise<EntryActivity[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("list_entry_activity", {
        p_org: orgId, p_entry_id: entryId,
      });
      if (error) throw error;
      return (data ?? []) as EntryActivity[];
    },
  });
}
