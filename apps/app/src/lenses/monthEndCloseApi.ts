/**
 * Firm-level month-end close data (card RV2-C1). Extends the CPA practice home
 * (W1.4) with a set-based close across many clients, WITHOUT a new schema spine.
 *
 * Reads (cpa_close_readiness, doc_chase_templates) are server-authoritative and
 * gated by cpa_firm_clients / RLS, so a firm sees exactly its own clients — never
 * another firm's. Writes (batch close, doc request) go through the `cpa-close`
 * edge function, which passes the JWT-verified actor to the p_actor-first,
 * service_role-only RPCs (ISOTEST lineage) — the browser never asserts identity.
 *
 * Kinds / thresholds mirror the migration
 * (20260707030000_rv2_c1_cpa_month_end_close.sql) — keep them in lockstep.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "../lib/supabase";
import { invoke } from "../ledger/api";

export interface CloseReadiness {
  client_org_id: string;
  client_name: string;
  access: "read_only" | "full";
  period_id: string | null;
  period_start: string | null;
  period_end: string | null;
  uncategorized: number;
  unreconciled: number;
  pending_review: number;
  open_flags: number;
  blockers: number;
  ready: boolean;
  overdue: boolean;
  open_doc_requests: number;
}

export interface DocTemplate {
  slug: string;
  label: string;
  body: string;
}

/** One result row per requested client from a batch close. */
export type BatchCloseResult = {
  client_org_id: string;
  period_id: string | null;
  result: "closed" | "skipped" | "blocked" | "forbidden" | "not_found";
};

function asNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

/** Per-client month-end close checklist for the firm, for a period-end date. */
export function useCloseReadiness(firmId: string | undefined, periodEnd?: string) {
  return useQuery({
    queryKey: ["cpa-close-readiness", firmId, periodEnd ?? "today"],
    enabled: Boolean(firmId),
    queryFn: async (): Promise<CloseReadiness[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("cpa_close_readiness", {
        p_firm: firmId,
        ...(periodEnd ? { p_period_end: periodEnd } : {}),
      });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        client_org_id: String(r.client_org_id),
        client_name: String(r.client_name),
        access: r.access as CloseReadiness["access"],
        period_id: r.period_id ? String(r.period_id) : null,
        period_start: r.period_start ? String(r.period_start) : null,
        period_end: r.period_end ? String(r.period_end) : null,
        uncategorized: asNum(r.uncategorized),
        unreconciled: asNum(r.unreconciled),
        pending_review: asNum(r.pending_review),
        open_flags: asNum(r.open_flags),
        blockers: asNum(r.blockers),
        ready: Boolean(r.ready),
        overdue: Boolean(r.overdue),
        open_doc_requests: asNum(r.open_doc_requests),
      }));
    },
  });
}

/** The live, active doc-chase templates (config; label + body). */
export function useDocTemplates() {
  return useQuery({
    queryKey: ["doc-chase-templates"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DocTemplate[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("doc_chase_templates")
        .select("slug,label,body,is_active,sort")
        .eq("is_active", true)
        .order("sort");
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        slug: String(r.slug),
        label: String(r.label),
        body: String(r.body),
      }));
    },
  });
}

/** Close the covering open period for each selected client, in one round-trip. */
export function batchClose(input: {
  firm_id: string;
  client_org_ids: string[];
  period_end?: string;
  force?: boolean;
}): Promise<{ results: BatchCloseResult[] }> {
  return invoke<{ results: BatchCloseResult[] }>("cpa-close", {
    op: "batch_close",
    firm_id: input.firm_id,
    client_org_ids: input.client_org_ids,
    period_end: input.period_end,
    force: input.force ?? false,
  });
}

/** Record a doc request / statement chase against a client. */
export function requestDocs(input: {
  firm_id: string;
  client_org_id: string;
  template: string;
  note?: string;
}): Promise<{ request: unknown }> {
  return invoke<{ request: unknown }>("cpa-close", {
    op: "request_docs",
    firm_id: input.firm_id,
    client_org_id: input.client_org_id,
    template: input.template,
    note: input.note ?? null,
  });
}

/** Invalidate the close checklist (after a batch close or a doc request). */
export function useCloseRefresh(firmId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["cpa-close-readiness", firmId] });
    void qc.invalidateQueries({ queryKey: ["cpa-client-counts", firmId] });
    void qc.invalidateQueries({ queryKey: ["cpa-practice-queue", firmId] });
  };
}
