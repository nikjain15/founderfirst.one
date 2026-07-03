// LOOP-2 — the pure detection core.
//
// Given (a) the current committed seed state and (b) law-change signals extracted
// from watched sources, decide which signals are REAL, NEW, supersession-worthy
// changes and turn each into a SeedDiff (a new effective-dated row + citation +
// affected consumers). No I/O, no network, no globals — deterministic and unit-
// tested by the OBBBA 1099 replay. This is what makes the routine trustworthy:
// detection is a pure function you can prove correct.
//
// False-positive safety is enforced HERE, not by hoping the source is clean:
//   1. A signal for an obligation_key the source doesn't `govern` is dropped
//      upstream (run.ts), and detection re-checks the (jurisdiction, entity, key).
//   2. A signal that matches the row already in force (same threshold + deadline)
//      is a no-op → skipped, no diff.
//   3. A signal whose effective_from is not strictly newer than the current row's
//      is not a supersession → skipped.
//   4. A signal that would duplicate an already-present superseding row (same
//      natural key + effective_from) is skipped (idempotent — re-running never
//      re-proposes an applied change).
// Result with zero diffs === no PR (the caller logs and exits clean).

import type {
  DetectionResult,
  FilingObligationRow,
  LawChangeSignal,
  SeedDiff,
  SeedState,
} from "./types.js";
import { affectedConsumers } from "./consumers.js";

/** The row currently in force for a (jurisdiction, entity, tax_year, obligation)
 *  as of a date — mirrors the DB's filing_obligations_for(): the row with the
 *  latest effective_from whose window covers `asOf`. */
function rowInForce(
  state: SeedState,
  s: LawChangeSignal,
  asOf: string,
): FilingObligationRow | undefined {
  const candidates = state.filing_obligations
    .filter(
      (r) =>
        r.jurisdiction_code === s.jurisdiction_code &&
        r.entity_type === s.entity_type &&
        r.tax_year === s.tax_year &&
        r.obligation_key === s.obligation_key &&
        r.effective_from <= asOf &&
        (r.effective_to == null || r.effective_to >= asOf),
    )
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return candidates[0];
}

/** The latest effective_from among ALL rows for this key/year (regardless of
 *  whether their window covers a given date). Used to reject BACKDATED signals: a
 *  change must be newer than everything already on record for the obligation, else
 *  it would insert a spurious earlier row behind the current law. */
function latestKnownFrom(state: SeedState, s: LawChangeSignal): string | undefined {
  const froms = state.filing_obligations
    .filter(
      (r) =>
        r.jurisdiction_code === s.jurisdiction_code &&
        r.entity_type === s.entity_type &&
        r.tax_year === s.tax_year &&
        r.obligation_key === s.obligation_key,
    )
    .map((r) => r.effective_from)
    .sort();
  return froms[froms.length - 1];
}

/** Does the exact superseding row already exist (same natural key incl.
 *  effective_from)? Then the change was already applied — idempotent skip. */
function alreadyApplied(state: SeedState, s: LawChangeSignal): boolean {
  return state.filing_obligations.some(
    (r) =>
      r.jurisdiction_code === s.jurisdiction_code &&
      r.entity_type === s.entity_type &&
      r.tax_year === s.tax_year &&
      r.obligation_key === s.obligation_key &&
      r.effective_from === s.proposed.effective_from,
  );
}

/** Is the proposed change materially different from what's in force? A change is
 *  material if the threshold, the due date, the label, or the form differs. */
function isMaterialChange(
  current: FilingObligationRow | undefined,
  proposed: LawChangeSignal["proposed"],
): boolean {
  if (!current) return true; // brand-new obligation is always material
  const t = (v: number | null | undefined) => (v == null ? null : v);
  return (
    t(current.threshold_minor) !== t(proposed.threshold_minor ?? null) ||
    current.due_month !== proposed.due_month ||
    current.due_day !== proposed.due_day ||
    (proposed.form_code != null && current.form_code !== proposed.form_code) ||
    current.label !== proposed.label
  );
}

/** Build the superseding seed row from a signal. Carries source=regulatory_watcher
 *  and the citation; NEVER sets effective_to (that's the loader's supersede job on
 *  the OLD row). Old-law rows are untouched. */
function buildNewRow(
  s: LawChangeSignal,
  current: FilingObligationRow | undefined,
): FilingObligationRow {
  const p = s.proposed;
  return {
    jurisdiction_code: s.jurisdiction_code,
    entity_type: s.entity_type,
    tax_year: s.tax_year,
    obligation_key: s.obligation_key,
    kind: p.kind ?? current?.kind ?? "other",
    form_code: p.form_code ?? current?.form_code,
    label: p.label,
    due_month: p.due_month,
    due_day: p.due_day,
    due_year_offset: p.due_year_offset ?? current?.due_year_offset ?? 1,
    threshold_minor:
      p.threshold_minor !== undefined ? p.threshold_minor : current?.threshold_minor ?? null,
    notes: s.summary,
    effective_from: p.effective_from,
    effective_to: null,
    citation: s.citation,
    source: "regulatory_watcher",
  };
}

/** THE pure detector. Deterministic; the OBBBA 1099 replay proves it. */
export function detect(
  state: SeedState,
  signals: LawChangeSignal[],
): DetectionResult {
  const diffs: SeedDiff[] = [];
  const skipped: DetectionResult["skipped"] = [];

  for (const s of signals) {
    // Guard 4: idempotent — the superseding row already exists.
    if (alreadyApplied(state, s)) {
      skipped.push({ signal: s, reason: "already applied (superseding row exists at this effective_from)" });
      continue;
    }

    const current = rowInForce(state, s, s.proposed.effective_from);

    // Guard 3a: a signal for an obligation we already have on record must be
    // strictly NEWER than everything on record for it — a backdated signal
    // (effective_from at or before the latest known row) is never a supersession,
    // even if its date falls in a gap the current window doesn't cover.
    const latest = latestKnownFrom(state, s);
    if (latest !== undefined && s.proposed.effective_from <= latest) {
      skipped.push({ signal: s, reason: `effective_from ${s.proposed.effective_from} not newer than latest known row ${latest} (backdated — not a supersession)` });
      continue;
    }

    // Guard 3b: effective_from must be strictly newer than the row it supersedes.
    if (current && s.proposed.effective_from <= current.effective_from) {
      skipped.push({ signal: s, reason: `effective_from ${s.proposed.effective_from} not newer than in-force row ${current.effective_from}` });
      continue;
    }

    // Guard 2: no material difference → no-op → no PR.
    if (!isMaterialChange(current, s.proposed)) {
      skipped.push({ signal: s, reason: "no material change vs. row in force (threshold/deadline/label/form identical)" });
      continue;
    }

    const new_row = buildNewRow(s, current);
    diffs.push({
      obligation_key: s.obligation_key,
      jurisdiction_code: s.jurisdiction_code,
      entity_type: s.entity_type,
      tax_year: s.tax_year,
      new_row,
      supersedes: current,
      citation: s.citation,
      effective_from: s.proposed.effective_from,
      affected_consumers: affectedConsumers(new_row),
      summary: s.summary,
    });
  }

  return { diffs, skipped };
}
