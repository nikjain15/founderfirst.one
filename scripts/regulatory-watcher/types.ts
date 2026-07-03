// LOOP-2 · Regulatory-watcher — shared types.
//
// The watcher turns a "law changed" signal into ONE reviewed seed-diff PR
// (Roadmap principle 3c). Nothing here contains a law literal: thresholds,
// deadlines, and % live in the seed DATA (supabase/seeds/kernel/*.json) that a
// finding proposes to supersede — never inline in code.

/** A filing_obligations seed row, matching supabase/seeds/kernel/filing_obligations.json.
 *  This is the ONE shape a law change edits (thresholds / deadlines live here). */
export interface FilingObligationRow {
  jurisdiction_code: string;
  entity_type: string;
  tax_year: number;
  obligation_key: string;
  kind: string;
  form_code?: string;
  label: string;
  due_month: number;
  due_day: number;
  due_year_offset?: number;
  threshold_minor?: number | null;
  notes?: string;
  effective_from: string; // ISO date
  effective_to?: string | null;
  citation: string;
  source?: string; // 'seed' | 'regulatory_watcher'
}

/** The current committed seed state the watcher diffs against. Only the tables a
 *  law change touches today (filing_obligations). Extend as the kernel grows. */
export interface SeedState {
  filing_obligations: FilingObligationRow[];
}

/** A watched official source (DATA, not code). The registry lives in sources.json.
 *  `kind` tells the fetch layer how to read it; detection is source-agnostic. */
export interface WatchedSource {
  id: string;
  label: string;
  url: string;
  kind: "irs_newsroom" | "form_instructions" | "state_dor" | "trade_press";
  jurisdiction_code: string;
  /** obligation_keys this source can speak to (so an unrelated page can't ever
   *  produce a diff for an obligation it doesn't govern — false-positive guard). */
  governs: string[];
  cadence: "weekly" | "seasonal_daily";
}

/** A candidate law change extracted from a source (or replayed from a fixture).
 *  This is the ONLY thing the fetch/extract layer emits; the pure detector decides
 *  whether it is a real, new, supersession-worthy change. */
export interface LawChangeSignal {
  source_id: string;
  jurisdiction_code: string;
  entity_type: string;
  tax_year: number;
  obligation_key: string;
  /** The new law's fields as they should appear in the superseding seed row. */
  proposed: Partial<FilingObligationRow> &
    Pick<FilingObligationRow, "label" | "due_month" | "due_day" | "effective_from">;
  citation: string;
  /** Human summary of what changed, for the PR body + notes. */
  summary: string;
}

/** One superseding seed row the watcher wants to add, with everything a reviewer
 *  needs: the row, the citation, the effective window, and the affected consumers. */
export interface SeedDiff {
  obligation_key: string;
  jurisdiction_code: string;
  entity_type: string;
  tax_year: number;
  /** The NEW row to append to filing_obligations.json (never an overwrite). */
  new_row: FilingObligationRow;
  /** The prior row this supersedes, if any (for the "old law" note). */
  supersedes?: FilingObligationRow;
  citation: string;
  effective_from: string;
  /** Human-readable list of app surfaces affected by this change. */
  affected_consumers: string[];
  summary: string;
}

/** Result of a detection pass. Empty diffs === no change detected === no PR
 *  (false-positive-safe: log only). */
export interface DetectionResult {
  diffs: SeedDiff[];
  /** Signals inspected but rejected (already applied / not new / not governed),
   *  with the reason — so a run always explains itself in the log. */
  skipped: { signal: LawChangeSignal; reason: string }[];
}
