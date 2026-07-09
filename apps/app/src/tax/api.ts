/**
 * RV2-A1 — read-side data for the Filing worksheet. Thin React-Query hooks over the
 * seeded Wave-1 tax mapping engine (tax_forms / tax_form_lines / resolve_account_tax_lines)
 * and the org's tax profile (org_accounting_settings). All reads; no writes here — the
 * worksheet is a review surface (structured export / e-file are later steps).
 *
 * Nothing in here holds a tax fact: form names, line labels/numbers and the account→line
 * mapping ALL come from the seeded tables. jurisdiction_code + entity_type come from the
 * org's profile. If a profile is missing we surface "set this up" copy, never a default.
 */
import { useQuery } from "@tanstack/react-query";
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

// ── structured tax export audit (RV2-A2 follow-up) ───────────────────────────
// The import file is built + downloaded client-side (taxExport.ts); this records
// ONE audit row per export (who / which suite / which form+year / when) through
// the SAME report-export fn every other export already logs to (W1.2) — a
// `tax_export` report kind, not a second, parallel audit path. Fire-and-forget:
// a logging failure must never block the download the user already got.
export const logTaxExport = (input: {
  org_id: string;
  format: "csv" | "html";
  suite: string;
  form_code: string;
  tax_year: number;
  filename?: string;
}) =>
  invoke<{ ok: true }>("report-export", {
    org_id: input.org_id,
    report: "tax_export",
    format: input.format,
    suite: input.suite,
    form_code: input.form_code,
    tax_year: input.tax_year,
    filename: input.filename,
  });
