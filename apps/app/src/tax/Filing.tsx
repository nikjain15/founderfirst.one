/**
 * RV2-A1 — the Filing surface: a review-ready return worksheet per form, where every
 * line drills down to the exact ledger entries behind it ("show your work"). Rendered
 * inside the Ledger workspace (owner=view under Advanced, CPA=review workflow tab).
 *
 * All tax facts come from the seeded engine (forms/lines/mapping); the amounts come
 * from the org's journal entries. This component is projection + presentation only —
 * no law literals, no writes. Structured export / e-file are deferred later steps.
 */
import { useMemo, useState } from "react";
import type { JournalEntry } from "../ledger/types";
import { formatMoney } from "../ledger/money";
import {
  useOrgTaxProfile, useTaxForms, useTaxFormLines, useTaxResolution, logTaxExport,
} from "./api";
import { buildWorksheet, taxYearDateFilter, worksheetTiesOut, type Worksheet, type WorksheetLine, type WorksheetSource } from "./worksheet";
import { SERIALIZERS } from "./serializers";
import { downloadTaxExport, exportReady } from "./taxExport";
import type { TaxFormLine } from "./types";
import { COPY } from "../copy";

export default function Filing({ orgId, entries, orgName }: { orgId: string; entries: JournalEntry[]; orgName?: string }) {
  const profile = useOrgTaxProfile(orgId);
  const forms = useTaxForms(profile.data);

  const [formId, setFormId] = useState<string | null>(null);
  const activeForm = useMemo(
    () => forms.data?.find((f) => f.id === formId) ?? forms.data?.[0],
    [forms.data, formId],
  );
  const lines = useTaxFormLines(activeForm?.id);
  const resolution = useTaxResolution(
    orgId, profile.data?.jurisdiction_code, activeForm?.form_code, activeForm?.tax_year,
  );

  const worksheet = useMemo(() => {
    if (!activeForm || !lines.data || !resolution.data) return null;
    // Scope entries to the form's tax year. WITHOUT this, activity from every other
    // year rolls onto this year's return lines: the tie-out still passes (Σ entries ==
    // line) but the money is for the wrong period — a "review-ready" lie. Calendar-year
    // scoping mirrors the seeded engine's tax_year (fiscal-year returns are a later
    // refinement); the bounds are pure date math, not a law literal.
    const yearFilter = taxYearDateFilter(activeForm.tax_year);
    return buildWorksheet(
      {
        jurisdiction_code: profile.data?.jurisdiction_code ?? "",
        form_code: activeForm.form_code, entity_type: activeForm.entity_type,
        tax_year: activeForm.tax_year, form_name: activeForm.name,
      },
      lines.data, resolution.data, entries, yearFilter,
    );
  }, [activeForm, lines.data, resolution.data, entries, profile.data]);

  const loading = profile.isLoading || forms.isLoading || lines.isLoading || resolution.isLoading;
  const errored = profile.isError || forms.isError || lines.isError || resolution.isError;

  return (
    <section className="filing">
      <header className="filing-head">
        <p className="eyebrow">{COPY.filing.eyebrow}</p>
        <h2 className="section-h">{COPY.filing.heading}</h2>
        <p className="sub">{COPY.filing.lead}</p>
      </header>

      {errored && <p className="error">{COPY.filing.loadError}</p>}

      {!errored && !loading && profile.data && !profile.data.entity_type && (
        <Empty title={COPY.filing.profileNeededTitle} body={COPY.filing.profileNeededBody} />
      )}

      {!errored && !loading && profile.data?.entity_type && (forms.data?.length ?? 0) === 0 && (
        <Empty title={COPY.filing.noFormsTitle} body={COPY.filing.noFormsBody} />
      )}

      {loading && <p className="muted">{COPY.filing.loading}</p>}

      {!errored && activeForm && (forms.data?.length ?? 0) > 0 && (
        <>
          <div className="filing-controls" role="group" aria-label={COPY.filing.formLabel}>
            <label className="filing-form">
              <span>{COPY.filing.formLabel}</span>
              <select
                value={activeForm.id}
                onChange={(e) => setFormId(e.target.value)}
              >
                {forms.data!.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} · {f.tax_year}</option>
                ))}
              </select>
            </label>
          </div>

          {worksheet && (
            <WorksheetView
              worksheet={worksheet}
              formLines={lines.data ?? []}
              orgName={orgName ?? activeForm.form_code}
              orgId={orgId}
              formCode={activeForm.form_code}
              taxYear={activeForm.tax_year}
            />
          )}
        </>
      )}
    </section>
  );
}

function WorksheetView({
  worksheet, formLines, orgName, orgId, formCode, taxYear,
}: {
  worksheet: Worksheet; formLines: TaxFormLine[]; orgName: string;
  orgId: string; formCode: string; taxYear: number;
}) {
  const ties = useMemo(() => worksheetTiesOut(worksheet), [worksheet]);
  const hasAny = worksheet.lines.some((l) => l.amount_minor !== 0) || worksheet.unmapped.length > 0;

  if (!hasAny) {
    return <Empty title={COPY.filing.emptyTitle} body={COPY.filing.emptyBody} />;
  }

  return (
    <div className="worksheet">
      <p className={`sub sm ${ties ? "" : "error"}`}>
        {ties ? COPY.filing.tiesNote : COPY.filing.doesNotTie}
      </p>
      <p className={`filing-ready ${worksheet.reviewReady ? "t-good" : "t-warn"}`}>
        {worksheet.reviewReady
          ? COPY.filing.reviewReady
          : COPY.filing.notReviewReady(worksheet.unmapped.length)}
      </p>

      <div className="table-wrap" tabIndex={0} role="region" aria-label={COPY.filing.lineTableAria}>
        <div className="worksheet-table">
          <div className="worksheet-head">
            <span>{COPY.filing.colLine}</span>
            <span>{COPY.filing.colDescription}</span>
            <span className="num">{COPY.filing.colAmount}</span>
          </div>
          {worksheet.lines.map((line) => <LineRow key={line.line_key} line={line} />)}
        </div>
      </div>

      {worksheet.unmapped.length > 0 && (
        <div className="worksheet-unmapped">
          <h3 className="section-h">{COPY.filing.unmappedHeading}</h3>
          <p className="sub sm">{COPY.filing.unmappedLead}</p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label={COPY.filing.unmappedHeading}>
            <div className="worksheet-table">
              {worksheet.unmapped.map((u) => (
                <div className="worksheet-row" key={u.account_id}>
                  <span className="w-code">{u.account_code ?? COPY.common.emDash}</span>
                  <span className="w-label">{u.account_name}</span>
                  <span className="w-amt num">{formatMoney(u.amount_minor)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ExportPanel
        worksheet={worksheet} formLines={formLines} orgName={orgName} ties={ties}
        orgId={orgId} formCode={formCode} taxYear={taxYear}
      />
    </div>
  );
}

/** RV2-A2 — the "3 taps, one file" export: pick the suite format, download the import
 *  file. Gated on the return being review-ready AND tying out — an unmapped or
 *  non-tying return must NEVER be handed to tax software (the #1 filing trust risk). */
function ExportPanel({
  worksheet, formLines, orgName, ties, orgId, formCode, taxYear,
}: {
  worksheet: Worksheet; formLines: TaxFormLine[]; orgName: string; ties: boolean;
  orgId: string; formCode: string; taxYear: number;
}) {
  // Suite options come from the serializer registry (pluggable), never a hardcoded list.
  const suites = useMemo(
    () => Object.values(SERIALIZERS).map((s) => ({ id: s.id, label: s.label })),
    [],
  );
  const [suiteId, setSuiteId] = useState(suites[0]?.id ?? "generic_csv");
  const [done, setDone] = useState<string | null>(null);
  const ready = exportReady(worksheet, ties);

  function onExport() {
    // Build + download client-side first (the user gets their file even if the
    // audit call later fails); then record the export. Fire-and-forget audit —
    // mirrors ledger/Ledger.tsx's report-export logging exactly (W1.2 pattern).
    const { filename, extension } = downloadTaxExport(worksheet, formLines, suiteId, orgName);
    setDone(filename);
    void logTaxExport({
      org_id: orgId, format: extension === "html" ? "html" : "csv",
      suite: suiteId, form_code: formCode, tax_year: taxYear, filename,
    }).catch(() => { /* audit best-effort; download already delivered */ });
  }

  return (
    <div className="filing-export">
      <h3 className="section-h">{COPY.filing.exportHeading}</h3>
      <p className="sub sm">{COPY.filing.exportLead}</p>
      <div className="filing-export-controls" role="group" aria-label={COPY.filing.exportHeading}>
        <label className="filing-export-suite">
          <span>{COPY.filing.exportSuiteLabel}</span>
          <select value={suiteId} onChange={(e) => { setSuiteId(e.target.value); setDone(null); }}>
            {suites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          disabled={!ready}
          onClick={onExport}
        >
          {COPY.filing.exportButton}
        </button>
      </div>
      {!ready && (
        <p className="sub sm t-warn">
          {!ties ? COPY.filing.exportDoesNotTie : COPY.filing.exportNotReady}
        </p>
      )}
      {ready && done && <p className="sub sm t-good" role="status">{COPY.filing.exportDone(done)}</p>}
    </div>
  );
}

function LineRow({ line }: { line: WorksheetLine }) {
  const [open, setOpen] = useState(false);
  const count = line.source_entries.length;
  const mappedBadge = line.resolved_by === "override"
    ? COPY.filing.mappedByOverride
    : line.resolved_by === "rule" ? COPY.filing.mappedByRule : null;

  return (
    <div className="worksheet-line">
      <button
        className="worksheet-row worksheet-row-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={count === 0}
      >
        <span className="w-code">{line.line_code ?? COPY.common.emDash}</span>
        <span className="w-label">
          {line.label}
          {mappedBadge && <span className="w-badge">{mappedBadge}</span>}
        </span>
        <span className="w-amt num">{formatMoney(line.amount_minor)}</span>
        {count > 0 && <span className="w-caret">{open ? "▾" : "▸"}</span>}
      </button>
      {open && (
        <div className="worksheet-sources">
          {count === 0 ? (
            <p className="muted sm">{COPY.filing.noSources}</p>
          ) : (
            <div className="table-wrap" tabIndex={0} role="region" aria-label={COPY.filing.sourcesTableAria}>
              <div className="worksheet-src-table">
                <div className="worksheet-src-head">
                  <span>{COPY.filing.srcDate}</span>
                  <span>{COPY.filing.srcAccount}</span>
                  <span>{COPY.filing.srcMemo}</span>
                  <span className="num">{COPY.filing.srcAmount}</span>
                </div>
                {line.source_entries.map((s, i) => <SourceRow key={`${s.entry_id}-${s.account_id}-${i}`} src={s} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceRow({ src }: { src: WorksheetSource }) {
  return (
    <div className="worksheet-src-row">
      <span className="s-date">{src.entry_date}</span>
      <span className="s-acct">{src.account_code ? `${src.account_code} · ` : ""}{src.account_name}</span>
      <span className="s-memo">{src.memo ?? COPY.common.emDash}</span>
      <span className="s-amt num">{formatMoney(src.amount_minor)}</span>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="ledger-empty">
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </div>
  );
}
