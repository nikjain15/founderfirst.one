// LOOP-2 — PR artifact builder.
//
// Turns detected seed-diffs into (a) the updated filing_obligations.json rows to
// append and (b) a decision-needed PR body carrying, for EVERY diff: the citation,
// the effective window (old→new), and the affected-consumer list (BACKLOG LOOP-2
// acceptance (b)). It NEVER merges — it only writes the branch + opens a draft PR
// flagged decision-needed (acceptance (c): branch protection + the decision-needed
// flow keep a human in the loop).

import type { FilingObligationRow, SeedDiff } from "./types.js";
import { consumerSummary } from "./consumers.js";

const fmtMinor = (v: number | null | undefined): string =>
  v == null ? "—" : `$${(v / 100).toLocaleString("en-US")}`;

const fmtDue = (r: { due_month: number; due_day: number; due_year_offset?: number }): string => {
  const off = r.due_year_offset ?? 1;
  const when = off === 0 ? "in tax year" : off === 2 ? "+2 years" : "following year";
  return `${r.due_month}/${r.due_day} (${when})`;
};

/** The new rows to append to supabase/seeds/kernel/filing_obligations.json.
 *  Appended (never overwriting) so old-law rows stay put; the loader's
 *  supersede_filing_obligation closes the prior window on apply. */
export function newSeedRows(diffs: SeedDiff[]): FilingObligationRow[] {
  return diffs.map((d) => d.new_row);
}

/** The decision-needed PR body. Self-contained: a reviewer approves or rejects
 *  from this alone — citation, effective dates, affected consumers all present. */
export function prBody(diffs: SeedDiff[], runContext: { detectedAt: string; sources: number }): string {
  const lines: string[] = [];
  lines.push("## 🏛️ Regulatory-watcher — law change detected (decision-needed)");
  lines.push("");
  lines.push(
    "Auto-drafted by the LOOP-2 regulatory watcher. This is a **DATA change** to the " +
      "effective-dated tax kernel (Roadmap principle 3c), not a code sweep. Merging it " +
      "updates every consuming surface at once; **rejecting it changes nothing**. " +
      "A human MUST review and merge — the watcher never self-merges.",
  );
  lines.push("");
  lines.push(`> Detected ${runContext.detectedAt} across ${runContext.sources} watched source(s). One superseding row per change; old-law rows are left untouched so old periods keep old law.`);
  lines.push("");

  for (const d of diffs) {
    const c = d.new_row;
    lines.push(`### ${c.jurisdiction_code} · ${c.entity_type} · ${c.obligation_key} (tax year ${c.tax_year})`);
    lines.push("");
    lines.push(d.summary);
    lines.push("");
    lines.push("| Field | Old (in force) | New (superseding) |");
    lines.push("|---|---|---|");
    lines.push(`| Threshold | ${fmtMinor(d.supersedes?.threshold_minor)} | ${fmtMinor(c.threshold_minor)} |`);
    lines.push(`| Due | ${d.supersedes ? fmtDue(d.supersedes) : "—"} | ${fmtDue(c)} |`);
    lines.push(`| Label | ${d.supersedes?.label ?? "—"} | ${c.label} |`);
    lines.push(`| Effective from | ${d.supersedes?.effective_from ?? "—"} | **${c.effective_from}** |`);
    lines.push("");
    lines.push(`**Citation:** ${c.citation}`);
    lines.push("");
    lines.push(`**Affected consumers:** ${consumerSummary(d)}`);
    lines.push("");
    lines.push("<details><summary>Superseding seed row (to append to filing_obligations.json)</summary>");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(c, null, 2));
    lines.push("```");
    lines.push("</details>");
    lines.push("");
  }

  lines.push("---");
  lines.push("### Reviewer checklist (law change)");
  lines.push("- [ ] Citation is the **primary** source (IRS rev-proc / bill / instruction), or trade-press corroborated by one");
  lines.push("- [ ] `effective_from` is correct — old periods must keep old law");
  lines.push("- [ ] Threshold / deadline values match the cited source");
  lines.push("- [ ] Affected-consumer list looks complete");
  lines.push("- [ ] `pnpm seed:kernel` regenerated `_generated.sql` (idempotent, effective-dating intact)");
  lines.push("");
  lines.push("`decision-needed` — law changes are always Nik's (later a reviewing CPA's) call.");
  return lines.join("\n");
}

/** The PR title. */
export function prTitle(diffs: SeedDiff[]): string {
  if (diffs.length === 1) {
    const d = diffs[0];
    return `law(${d.jurisdiction_code}): ${d.obligation_key} change → superseding seed row (tax year ${d.tax_year})`;
  }
  return `law: ${diffs.length} regulatory changes → superseding seed rows [decision-needed]`;
}
