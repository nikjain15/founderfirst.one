/**
 * RV2-A1 — read-side data for the Filing worksheet. Thin React-Query hooks over the
 * seeded Wave-1 tax mapping engine (tax_forms / tax_form_lines / resolve_account_tax_lines)
 * and the org's tax profile (org_accounting_settings). All reads; no writes here — the
 * worksheet is a review surface (structured export / e-file are later steps).
 *
 * Nothing in here holds a tax fact: form names, line labels/numbers and the account→line
 * mapping ALL come from the seeded tables. jurisdiction_code + entity_type come from the
 * org's profile. If a profile is missing we surface "set this up" copy, never a default.
 *
 * The write path (below, CPA mapping edits) is the W1.3-B follow-up carded from the
 * standing AUDIT.md gap "CPA mapping-edit UI deferred" — set_account_tax_line /
 * clear_account_tax_line shipped with the engine but were never called from the app.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "../lib/supabase";
import { invoke } from "../ledger/api";
import type { AccountResolution, TaxFormLine } from "./types";

/** The org's tax profile (from org_accounting_settings, CENTRAL-2). Null when unset —
 *  the worksheet then prompts to complete the profile rather than guessing a form. */
export interface OrgTaxProfile {
  jurisdiction_code: string;
  entity_type: string | null;
}

export function useOrgTaxProfile(orgId: string | undefined) {
  return useQuery({
    queryKey: ["org-tax-profile", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<OrgTaxProfile | null> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("org_accounting_settings")
        .select("jurisdiction_code,entity_type")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as OrgTaxProfile | null;
    },
  });
}

/** A tax form available for a jurisdiction × entity_type (the returns this org could
 *  file). Sourced from the seeded tax_forms — the picker options, never a hardcoded list. */
export interface TaxFormRef {
  id: string;
  form_code: string;
  name: string;
  tax_year: number;
  entity_type: string;
}

export function useTaxForms(profile: OrgTaxProfile | null | undefined) {
  const jurisdiction = profile?.jurisdiction_code;
  const entityType = profile?.entity_type ?? undefined;
  return useQuery({
    queryKey: ["tax-forms", jurisdiction, entityType],
    enabled: Boolean(jurisdiction && entityType),
    queryFn: async (): Promise<TaxFormRef[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("tax_forms")
        .select("id,form_code,name,tax_year,entity_type")
        .eq("jurisdiction_code", jurisdiction)
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .is("effective_to", null)
        .order("tax_year", { ascending: false })
        .order("form_code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TaxFormRef[];
    },
  });
}

/** The lines of one tax form (tax_form_lines), in form order. Drives the worksheet's
 *  full form shape. Keyed by the form id resolved from the picker. */
export function useTaxFormLines(formId: string | undefined) {
  return useQuery({
    queryKey: ["tax-form-lines", formId],
    enabled: Boolean(formId),
    queryFn: async (): Promise<TaxFormLine[]> => {
      const sb = getClient();
      const { data, error } = await sb
        .from("tax_form_lines")
        .select("line_key,line_code,label,section,sort_order,kind,deductible_pct,flows_to,notes,export_codes")
        .eq("form_id", formId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TaxFormLine[];
    },
  });
}

/** Per-account resolution to tax lines (resolve_account_tax_lines RPC): CPA override
 *  wins, else lowest-priority seed rule, else unmapped — with the WHY for explainability. */
export function useTaxResolution(
  orgId: string | undefined,
  jurisdiction: string | undefined,
  formCode: string | undefined,
  taxYear: number | undefined,
) {
  return useQuery({
    queryKey: ["tax-resolution", orgId, jurisdiction, formCode, taxYear],
    enabled: Boolean(orgId && jurisdiction && formCode && taxYear),
    queryFn: async (): Promise<AccountResolution[]> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("resolve_account_tax_lines", {
        p_org_id: orgId,
        p_jurisdiction_code: jurisdiction,
        p_form_code: formCode,
        p_tax_year: taxYear,
      });
      if (error) throw error;
      return (data ?? []) as AccountResolution[];
    },
  });
}

// ── write path (CPA mapping edits — the W1.3-B follow-up) ───────────────────
// Gated server-side by can_edit_tax_map_as (an active FULL engagement — research
// decision 3: owners view, CPAs edit) AND the tax-mapping edge fn's MFA check.
// The UI's canEdit prop is a courtesy; these two are the control.

/** Assign (or re-assign) an account to a return line. Audit-logged; refuses a
 *  line_key not defined on an active form of form_code (server-side integrity). */
export const setAccountTaxLine = (
  orgId: string, accountId: string, formCode: string, lineKey: string, note?: string,
) => invoke<{ id: string }>("tax-mapping", {
  op: "set_line", org_id: orgId, account_id: accountId, form_code: formCode, line_key: lineKey, note,
});

/** Remove a CPA override so the account falls back to the seeded rule (or unmapped). */
export const clearAccountTaxLine = (orgId: string, accountId: string, formCode: string) =>
  invoke<{ ok: true }>("tax-mapping", { op: "clear_line", org_id: orgId, account_id: accountId, form_code: formCode });

/** Re-fetch the resolution after a mapping edit so the account moves off the
 *  unmapped list / onto its new line immediately. */
export function useTaxMappingRefresh(
  orgId: string | undefined, jurisdiction: string | undefined, formCode: string | undefined, taxYear: number | undefined,
) {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ["tax-resolution", orgId, jurisdiction, formCode, taxYear] }); };
}
