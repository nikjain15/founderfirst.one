/**
 * W1.3-B tax mapping engine — the computation (research §B, "Mapping computation").
 *
 * Pure functions over DATA: the resolved account->line map + form-line metadata +
 * account balances all arrive as arguments (sourced from the seeded tables and the
 * ledger reports). NO law literals here (deductibility %, thresholds, line numbers
 * are all data) — check-law-literals stays clean.
 *
 *   mapReturn()   — roll each account's balance onto its resolved tax line; every
 *                   account lands on exactly one line OR the unmapped bucket
 *                   (research §B.0.4 — never silently dropped). Ties to the books.
 *   draftM1Adjustments() — mechanical book-tax differences Penny may PROPOSE
 *                   (meals/penalties/entertainment disallowance). These  // law-ok: names the mechanism; the % is seeded deductible_pct, not a literal here
 *                   are DRAFTS; a human approves before they touch a return
 *                   (research §B.0.5). Emitted as M1Draft rows for draft_tax_adjustment.
 *   scheduleM1()  — the M-1 reconciliation from book net income + APPROVED adjustments.
 */
import type {
  AccountAmount, AccountResolution, TaxFormLine, MappedLine, MappedReturn,
  M1Draft, M1Bucket, ScheduleM1,
} from "./types";

/** Roll account balances onto their resolved tax lines. Book basis — deductibility
 *  is NOT applied here (that is the M-1 layer's job); a line carries the full book
 *  amount, and draftM1Adjustments() proposes the disallowance separately. */
export function mapReturn(
  meta: {
    jurisdiction_code: string; form_code: string; entity_type: string;
    tax_year: number; form_name: string;
  },
  lines: TaxFormLine[],
  resolutions: AccountResolution[],
  amounts: AccountAmount[],
): MappedReturn {
  const amtByAccount = new Map(amounts.map((a) => [a.account_id, a.amount_minor]));
  const lineByKey = new Map(lines.map((l) => [l.line_key, l]));

  const mapped = new Map<string, MappedLine>();
  const ensureLine = (key: string): MappedLine | null => {
    if (mapped.has(key)) return mapped.get(key)!;
    const l = lineByKey.get(key);
    if (!l) return null; // resolution pointed at a line the form doesn't define — skip, counts as unmapped below
    const ml: MappedLine = {
      line_key: l.line_key, line_code: l.line_code, label: l.label, section: l.section,
      sort_order: l.sort_order, kind: l.kind, deductible_pct: l.deductible_pct,
      flows_to: l.flows_to, amount_minor: 0, accounts: [],
    };
    mapped.set(key, ml);
    return ml;
  };

  const unmapped: MappedReturn["unmapped"] = [];
  let totalMappedMinor = 0;
  let totalUnmappedMinor = 0;

  for (const r of resolutions) {
    const amt = amtByAccount.get(r.account_id) ?? 0;
    const acct = {
      account_id: r.account_id, account_code: r.account_code,
      account_name: r.account_name, amount_minor: amt,
    };
    const line = r.resolved_by !== "unmapped" && r.line_key ? ensureLine(r.line_key) : null;
    if (line) {
      line.amount_minor += amt;
      line.accounts.push(acct);
      totalMappedMinor += amt;
    } else {
      unmapped.push(acct);
      totalUnmappedMinor += amt;
    }
  }

  // include every seeded line (even zero-amount) so the artifact shows the full
  // form shape, then sort by the form's own order.
  for (const l of lines) ensureLine(l.line_key);
  const outLines = [...mapped.values()].sort((a, b) => a.sort_order - b.sort_order);

  return {
    ...meta, lines: outLines, unmapped,
    totalMappedMinor, totalUnmappedMinor,
  };
}

/** Mechanical, Penny-PROPOSABLE M-1 differences (research §B.4). Derived from line
 *  metadata (deductible_pct < 100 ⇒ a disallowance) — no hardcoded %; the % is
 *  seeded data on the line. Returns DRAFTS; the caller persists them via
 *  draft_tax_adjustment (status='proposed') and a human approves.
 *
 *  A partly-deductible line applies its seeded pct: the disallowed portion becomes  // law-ok: describes the formula; the pct is data on the line, no literal
 *  an "expense on books not on return" permanent difference (0% ⇒ full amount). */
export function draftM1Adjustments(mapped: MappedReturn): M1Draft[] {
  const drafts: M1Draft[] = [];
  for (const line of mapped.lines) {
    const pct = line.deductible_pct;
    if (pct === null || pct === undefined || pct >= 100) continue; // fully deductible — no difference
    if (line.amount_minor === 0) continue;
    // disallowed portion = book amount × (1 − pct/100). Positive minor units.
    const disallowed = Math.round(Math.abs(line.amount_minor) * (1 - pct / 100));
    if (disallowed === 0) continue;
    drafts.push({
      m1_bucket: "expense_on_books_not_return", // book expense exceeds the deductible amount
      kind: "permanent",
      amount_minor: disallowed,
      line_key: line.line_key,
      memo: `${line.label}: ${pct}% deductible — ${formatMinor(disallowed)} disallowed (book-tax permanent difference)`,
      origin_kind: `deductibility_${line.line_key}`,
      origin_ref: `${line.line_key}:${mapped.tax_year}`,
    });
  }
  return drafts;
}

/** The Schedule M-1 reconciliation. bookNetIncomeMinor comes from profitAndLoss();
 *  approved is the set of APPROVED tax_adjustments (proposals excluded — research
 *  §B.0.5). Additions increase taxable income, subtractions decrease it. */
export function scheduleM1(
  bookNetIncomeMinor: number,
  approved: Array<{ m1_bucket: M1Bucket; kind: string; amount_minor: number }>,
): ScheduleM1 {
  const additions: ScheduleM1["additions"] = [];
  const subtractions: ScheduleM1["subtractions"] = [];
  let taxable = bookNetIncomeMinor;
  for (const a of approved) {
    const row = { bucket: a.m1_bucket, kind: a.kind, amount_minor: a.amount_minor };
    // ADD: expense on books not on return (book took a deduction the return can't),
    //      income on return not on books (return recognizes income books didn't).
    // SUBTRACT: income on books not on return, deduction on return not on books.
    if (a.m1_bucket === "expense_on_books_not_return" || a.m1_bucket === "income_on_return_not_books") {
      additions.push(row);
      taxable += a.amount_minor;
    } else {
      subtractions.push(row);
      taxable -= a.amount_minor;
    }
  }
  return { bookNetIncomeMinor, additions, subtractions, taxableIncomeMinor: taxable };
}

function formatMinor(minor: number): string {
  const dollars = (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return dollars;
}
