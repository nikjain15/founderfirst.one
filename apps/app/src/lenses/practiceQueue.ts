/**
 * Practice-home data — the CPA's cross-client work queue (card W1.4, APP_PRINCIPLES
 * §3). Both reads are server-authoritative RPCs (SECURITY DEFINER, gated by
 * can_access_org via cpa_firm_clients) so the client list, counts, and ranked
 * items can NEVER include an org the CPA can't already read (no client-side
 * authorization). The queue is read-only; mutations happen in the per-client tabs
 * through the existing write-path.
 *
 * `kind` values and `surface` routing mirror the migration
 * (20260703030000_cpa_practice_queue.sql) — keep the two in lockstep.
 */
import { useQuery } from "@tanstack/react-query";
import { getClient } from "../lib/supabase";

/** Which per-client tab resolves an item — the Ledger surface id to land on. */
export type QueueSurface = "journal" | "review" | "import" | "periods";
export type QueueKind =
  | "pending_review" | "uncategorized" | "unreconciled" | "flagged" | "upcoming_close";

export interface ClientCounts {
  client_org_id: string;
  client_name: string;
  access: "read_only" | "full";
  pending_review: number;
  uncategorized: number;
  unreconciled: number;
  flagged: number;
  upcoming_close: number;
  total: number;
}

export interface QueueItem {
  client_org_id: string;
  client_name: string;
  access: "read_only" | "full";
  kind: QueueKind;
  rank: number;
  surface: QueueSurface;
  ref_id: string;
  title: string;
  occurred_at: string;
}

/** RPC rows arrive with bigint counts as JS numbers under supabase-js. */
function asNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

/** Per-client badge counts + the active/archive split, for the firm. */
export function useClientCounts(firmId: string | undefined) {
  return useQuery({
    queryKey: ["cpa-client-counts", firmId],
    enabled: Boolean(firmId),
    queryFn: async (): Promise<ClientCounts[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("cpa_client_counts", { p_firm: firmId });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        client_org_id: String(r.client_org_id),
        client_name: String(r.client_name),
        access: r.access as ClientCounts["access"],
        pending_review: asNum(r.pending_review),
        uncategorized: asNum(r.uncategorized),
        unreconciled: asNum(r.unreconciled),
        flagged: asNum(r.flagged),
        upcoming_close: asNum(r.upcoming_close),
        total: asNum(r.total),
      }));
    },
  });
}

/** The ranked, flat cross-client queue for the firm. */
export function usePracticeQueue(firmId: string | undefined) {
  return useQuery({
    queryKey: ["cpa-practice-queue", firmId],
    enabled: Boolean(firmId),
    queryFn: async (): Promise<QueueItem[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("cpa_practice_queue", { p_firm: firmId });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        client_org_id: String(r.client_org_id),
        client_name: String(r.client_name),
        access: r.access as QueueItem["access"],
        kind: r.kind as QueueKind,
        rank: asNum(r.rank),
        surface: r.surface as QueueSurface,
        ref_id: String(r.ref_id),
        title: String(r.title ?? ""),
        occurred_at: String(r.occurred_at),
      }));
    },
  });
}

/** Compact age label (e.g. "3d", "5h", "12m") from an ISO timestamp. */
export function ageLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const d = Math.floor(diff / 86_400_000);
  if (d > 0) return `${d}d`;
  const h = Math.floor(diff / 3_600_000);
  if (h > 0) return `${h}h`;
  return `${Math.max(1, Math.floor(diff / 60_000))}m`;
}
