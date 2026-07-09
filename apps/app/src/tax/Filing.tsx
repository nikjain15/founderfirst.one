/**
 * RV2-A1 — the Filing surface: a review-ready return worksheet per form, where every
 * line drills down to the exact ledger entries behind it ("show your work"). Rendered
 * inside the Ledger workspace (owner=view under Advanced, CPA=review workflow tab).
 *
 * All tax facts come from the seeded engine (forms/lines/mapping); the amounts come
 * from the org's journal entries. This component is projection + presentation only —
 * no law literals, no writes (except the CPA mapping editor below, which calls the
 * dedicated tax-mapping write path — never a direct table write). Structured export /
 * e-file are deferred later steps.
 */
import { useMemo, useState } from "react";
import type { JournalEntry } from "../ledger/types";
import { formatMoney } from "../ledger/money";
import {
  clearAccountTaxLine, setAccountTaxLine, useOrgTaxProfile, useTaxForms, useTaxFormLines,
  useTaxMappingRefresh, useTaxResolution,
} from "./api";
import { buildWorksheet, taxYearDateFilter, worksheetTiesOut, type Worksheet, type WorksheetLine, type WorksheetSource, type WorksheetUnmapped } from "./worksheet";
import { SERIALIZERS } from "./serializers";
import { downloadTaxExport, exportReady } from "./taxExport";
import type { TaxFormLine } from "./types";
import { COPY } from "../copy";

/**
 * canEdit: true only for a CPA with write access (nav==='cpa' && canWrite) — mirrors
 * the server-side can_edit_tax_map_as gate (research decision 3: owners view, CPAs
 * edit). This is a courtesy that hides the editor from owners; the RPC gate is the
 * real control (ARCHITECTURE.md §1, §6 — "the disabled button is a courtesy").
 */
export default function Filing({
  orgId, entries, orgName, canEdit = false,
}: { orgId: string; entries: JournalEntry[]; orgName?: string; canEdit?: boolean }) {
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
  const refreshResolution = useTaxMappingRefresh(
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
              canEdit={canEdit}
              orgId={orgId}
              formCode={activeForm.form_code}
              onMapped={refreshResolution}
            />
          )}
        </>
      )}
    </section>
  );
}

function WorksheetView({
  worksheet, formLines, orgName, canEdit, orgId, formCode, onMapped,
}: {
  worksheet: Worksheet; formLines: TaxFormLine[]; orgName: string;
  canEdit: boolean; orgId: string; formCode: string; onMapped: () => void;
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
          {worksheet.lines.map((line) => (
            <LineRow
              key={line.line_key} line={line}
              canEdit={canEdit} orgId={orgId} formCode={formCode} onMapped={onMapped}
            />
          ))}
        </div>
      </div>

      {worksheet.unmapped.length > 0 && (
        <div className="worksheet-unmapped">
          <h3 className="section-h">{COPY.filing.unmappedHeading}</h3>
          <p className="sub sm">{COPY.filing.unmappedLead}</p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label={COPY.filing.unmappedHeading}>
            <div className="worksheet-table">
              {worksheet.unmapped.map((u) => (
                <UnmappedRow
                  key={u.account_id} unmapped={u} formLines={formLines}
                  canEdit={canEdit} orgId={orgId} formCode={formCode} onMapped={onMapped}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <ExportPanel worksheet={worksheet} formLines={formLines} orgName={orgName} ties={ties} />
    </div>
  );
}

/** W1.3-B follow-up — the CPA mapping-edit UI (the standing "deferred" gap in
 *  docs/AUDIT.md). set_account_tax_line existed since the engine shipped but was
 *  never called from the app; this is the missing door. Owners never see this row's
 *  picker (canEdit=false) — they see the same read-only unmapped list as before. */
function UnmappedRow({
  unmapped, formLines, canEdit, orgId, formCode, onMapped,
}: {
  unmapped: WorksheetUnmapped; formLines: TaxFormLine[]; canEdit: boolean;
  orgId: string; formCode: string; onMapped: () => void;
}) {
  // Only lines that hold a direct account amount are valid mapping targets — a
  // computed/subtotal/info line is a rollup, never something an account maps onto.
  const assignable = useMemo(() => formLines.filter((l) => l.kind === "amount"), [formLines]);
  const [lineKey, setLineKey] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  const save = async () => {
    if (!lineKey) return;
    setState("saving");
    try {
      await setAccountTaxLine(orgId, unmapped.account_id, formCode, lineKey);
      setState("idle");
      setLineKey("");
      onMapped();
    } catch {
      setState("error");
    }
  };

  return (
    <div className="worksheet-row worksheet-row-editable">
      <span className="w-code">{unmapped.account_code ?? COPY.common.emDash}</span>
      <span className="w-label">{unmapped.account_name}</span>
      <span className="w-amt num">{formatMoney(unmapped.amount_minor)}</span>
      {canEdit && (
        <span className="worksheet-map-editor">
          <select
            aria-label={`${COPY.filing.mapPickerLabel} — ${unmapped.account_name}`}
            value={lineKey}
            onChange={(e) => { setLineKey(e.target.value); setState("idle"); }}
            disabled={state === "saving"}
          >
            <option value="">{COPY.filing.mapPickerPlaceholder}</option>
            {assignable.map((l) => (
              <option key={l.line_key} value={l.line_key}>
                {l.line_code ? `${l.line_code} · ` : ""}{l.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" disabled={!lineKey || state === "saving"} onClick={save}>
            {state === "saving" ? COPY.filing.mapSaving : COPY.filing.mapSaveButton}
          </button>
          {state === "error" && <span className="sub sm error">{COPY.filing.mapError}</span>}
        </span>
      )}
    </div>
  );
}

/** RV2-A2 — the "3 taps, one file" export: pick the suite format, download the import
 *  file. Gated on the return being review-ready AND tying out — an unmapped or
 *  non-tying return must NEVER be handed to tax software (the #1 filing trust risk). */
function ExportPanel({
  worksheet, formLines, orgName, ties,
}: { worksheet: Worksheet; formLines: TaxFormLine[]; orgName: string; ties: boolean }) {
  // Suite options come from the serializer registry (pluggable), never a hardcoded list.
  const suites = useMemo(
    () => Object.values(SERIALIZERS).map((s) => ({ id: s.id, label: s.label })),
    [],
  );
  const [suiteId, setSuiteId] = useState(suites[0]?.id ?? "generic_csv");
  const [done, setDone] = useState<string | null>(null);
  const ready = exportReady(worksheet, ties);

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
          onClick={() => setDone(downloadTaxExport(worksheet, formLines, suiteId, orgName))}
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

function LineRow({
  line, canEdit, orgId, formCode, onMapped,
}: { line: WorksheetLine; canEdit: boolean; orgId: string; formCode: string; onMapped: () => void }) {
  const [open, setOpen] = useState(false);
  const count = line.source_entries.length;
  const mappedBadge = line.resolved_by === "override"
    ? COPY.filing.mappedByOverride
    : line.resolved_by === "rule" ? COPY.filing.mappedByRule : null;
  // A CPA override can be removed per account (falls back to the seed rule, or
  // unmapped). Rule-based mappings aren't in org_account_tax_map — nothing to clear.
  const overrideAccounts = useMemo(() => {
    if (line.resolved_by !== "override") return [];
    const seen = new Map<string, string>();
    for (const s of line.source_entries) seen.set(s.account_id, s.account_name);
    return [...seen.entries()];
  }, [line.resolved_by, line.source_entries]);

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
          {canEdit && overrideAccounts.length > 0 && (
            <div className="worksheet-unmap-actions">
              {overrideAccounts.map(([accountId, accountName]) => (
                <UnmapButton
                  key={accountId} accountId={accountId} accountName={accountName}
                  orgId={orgId} formCode={formCode} onMapped={onMapped}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UnmapButton({
  accountId, accountName, orgId, formCode, onMapped,
}: { accountId: string; accountName: string; orgId: string; formCode: string; onMapped: () => void }) {
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const unmap = async () => {
    setState("saving");
    try {
      await clearAccountTaxLine(orgId, accountId, formCode);
      setState("idle");
      onMapped();
    } catch {
      setState("error");
    }
  };
  return (
    <span className="worksheet-unmap-row">
      <button type="button" className="btn btn-sm btn-ghost" disabled={state === "saving"} onClick={unmap}>
        {state === "saving" ? COPY.filing.mapUnmapping : `${COPY.filing.mapUnmapButton} · ${accountName}`}
      </button>
      {state === "error" && <span className="sub sm error">{COPY.filing.mapError}</span>}
    </span>
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
