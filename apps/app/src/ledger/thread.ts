/**
 * Penny thread — intent routing + grounding-scope guard (card W3.1).
 *
 * The thread is a conversational surface on the owner's REAL books. Its hard rule
 * (acceptance + gate): Penny never invents a number. So the "brain" of the thread
 * is split in two:
 *
 *   1. This module — a PURE, DB-free classifier that decides what KIND of turn the
 *      owner took (greeting · narrate-activity · a grounded books QUESTION · out of
 *      scope) and, for a question, extracts the deterministic query (what account
 *      family / which period). It is unit-testable without a model or a database.
 *   2. The `penny-thread` edge fn — which, for a grounded question, COMPUTES the
 *      answer from the ledger (reusing the report math, tie-to-the-cent) and hands
 *      the model only the computed FACTS to phrase in Penny's live 'app' voice. The
 *      model never sees raw ledger rows to do arithmetic on, and it may not emit a
 *      figure that isn't in the facts — so numbers can't be hallucinated.
 *
 * An out-of-scope question (weather, tax advice, anything not answerable from THIS
 * org's ledger) is classified `unsupported` here and declined by the fn — never
 * answered with an invented figure. That is the grounding-scope refusal the
 * adversarial test asserts.
 *
 * No user-facing strings live here (CENTRAL-1 grep gate) — the UI maps these
 * structural intents to COPY; Penny's prose comes from the live 'app' persona.
 */

/** What kind of turn the owner took. */
export type ThreadIntent =
  | "greeting"       // "hi", "hey Penny"
  | "activity"       // "what have you done?", "what's new?", "catch me up"
  | "question"       // a grounded books question we can answer from the ledger
  | "unsupported";   // out of scope — decline, never invent

/** A money question we can answer deterministically from the ledger. */
export type MetricKind = "spend" | "income" | "net" | "cash";

export interface GroundedQuery {
  metric: MetricKind;
  /** A free-text account/category hint ("software", "travel") or null for a total. */
  categoryHint: string | null;
  /** Inclusive period bounds (YYYY-MM-DD) or null for all-time. */
  period: { start: string | null; end: string | null };
  /** Human label for the period, for the answer phrasing ("Q2 2026", "all time"). */
  periodLabel: string;
}

export interface ThreadRoute {
  intent: ThreadIntent;
  query?: GroundedQuery;
}

// ── Deterministic fact computation (ties to the reports, to the cent) ─────────
// The grounded answer's NUMBER comes from here, never from the model. This runs
// over the SAME paginated entry list the reports use (reports.ts / api.ts
// useEntries), so a thread figure and the Reports tab can never disagree. Exported
// for unit testing and reused by the fn's server-side computation (same math).
import { profitAndLoss, balanceSheet } from "./reports";
import type { JournalEntry } from "./types";

export interface GroundedFact {
  metric: MetricKind;
  /** The resolved amount in integer MINOR units (matches formatMoney). */
  amountMinor: number;
  /** The account label the number is scoped to, or null for a total. */
  categoryLabel: string | null;
  periodLabel: string;
  /** True when a categoryHint was asked but matched NO account — the fn declines
   *  ("I don't see a category for that") instead of reporting 0 as if it were real. */
  categoryUnmatched: boolean;
}

const dateInRange = (start: string | null, end: string | null) =>
  (d: string) => (start ? d >= start : true) && (end ? d <= end : true);

/**
 * Compute one grounded metric from the ledger. Pure + deterministic. Mirrors the
 * report math exactly (profitAndLoss / balanceSheet) so the thread ties out:
 *   • spend   → total (or one matched expense account) over the period
 *   • income  → total (or one matched income account) over the period
 *   • net     → net income over the period
 *   • cash    → cash & asset position as of the period end (or now)
 * A categoryHint that matches no account returns categoryUnmatched=true and a 0 the
 * caller must NOT report as a real figure — it declines instead.
 */
export function computeMetric(entries: JournalEntry[], q: GroundedQuery): GroundedFact {
  const filter = dateInRange(q.period.start, q.period.end);
  const hint = q.categoryHint?.toLowerCase().trim() || null;
  const matchAcct = (name: string, code: string | null) =>
    hint != null && (name.toLowerCase().includes(hint) || (code ?? "").toLowerCase() === hint);

  if (q.metric === "cash") {
    // Cash & assets as of the period end (balance-sheet total assets).
    const bs = balanceSheet(entries, q.period.end ?? undefined);
    return { metric: "cash", amountMinor: bs.totalAssets, categoryLabel: null, periodLabel: q.periodLabel, categoryUnmatched: false };
  }

  const pnl = profitAndLoss(entries, filter);
  if (q.metric === "net") {
    return { metric: "net", amountMinor: pnl.netIncome, categoryLabel: null, periodLabel: q.periodLabel, categoryUnmatched: false };
  }

  const lines = q.metric === "spend" ? pnl.expense : pnl.income;
  if (hint) {
    const hits = lines.filter((l) => matchAcct(l.name, l.code));
    if (hits.length === 0) {
      return { metric: q.metric, amountMinor: 0, categoryLabel: q.categoryHint, periodLabel: q.periodLabel, categoryUnmatched: true };
    }
    const amount = hits.reduce((s, l) => s + l.amount, 0);
    const label = hits.length === 1 ? hits[0].name : q.categoryHint;
    return { metric: q.metric, amountMinor: amount, categoryLabel: label, periodLabel: q.periodLabel, categoryUnmatched: false };
  }
  const total = q.metric === "spend" ? pnl.totalExpense : pnl.totalIncome;
  return { metric: q.metric, amountMinor: total, categoryLabel: null, periodLabel: q.periodLabel, categoryUnmatched: false };
}

const GREETING_RE = /^\s*(hi|hey|hello|yo|howdy)(\s+penny)?[\s!.,?]*$|^\s*good\s+(morning|afternoon|evening)[\s!.,?]*$|^\s*penny[\s!.,?]*$/i;
const ACTIVITY_RE = /\b(what('?s| is| have you| did you)?\s*(new|done|up|been up to|happening|going on)|catch me up|any(thing)? (new|news|updates?)|what did you do)\b/i;

// Words that anchor a question to the org's own money — required for a grounded
// "question". Without a money anchor AND a metric, we don't guess (→ unsupported).
const MONEY_RE = /\b(spend|spent|spending|cost|costs?|paid|pay|expense|expenses|income|revenue|earn|earned|made|make|bring in|brought in|sales?|profit|net|cash|balance|money|bottom line)\b/i;

// Off-books topics we explicitly refuse even if they mention money-ish words, so a
// question like "should I pay estimated taxes?" (advice, not a ledger fact) is
// declined rather than answered with a fabricated figure. Prediction ("will",
// "next quarter", "going to") is refused: the ledger is retrospective, not a forecast.
const ADVICE_RE = /\b(should i|advice|recommend|what if|predict|forecast|will\s+(i|my|it|the|we)|going to|next (quarter|month|year|week)|tax (advice|strategy|planning)|deductible|write.?off|invest|stock|weather|joke)\b/i;

/** Map free text to the metric we compute, or null if none is clearly asked. */
function metricFor(text: string): MetricKind | null {
  const t = text.toLowerCase();
  if (/\b(cash|bank balance|how much (money )?do i have|in the bank)\b/.test(t)) return "cash";
  if (/\b(net|profit|make|made|bottom line)\b/.test(t)) return "net";
  if (/\b(income|revenue|earn|earned|sales?|bring in|brought in)\b/.test(t)) return "income";
  if (/\b(spend|spent|spending|cost|costs?|paid|pay|expense|expenses)\b/.test(t)) return "spend";
  return null;
}

/**
 * Extract a category hint ("software", "travel & meals") from a spend/income
 * question. Best-effort: the phrase after "on"/"for", trimmed of trailing period
 * words. Null means "everything" (a total). The fn matches this hint against the
 * org's OWN account names — it never invents a category.
 */
function categoryHintFor(text: string): string | null {
  const m = text.match(/\b(?:on|for|to)\s+([a-z][a-z0-9 &/'-]{1,40}?)(?:\s+(?:in|during|last|this|for|q[1-4]|20\d\d|month|year|quarter)\b|[?.!,]|$)/i);
  if (!m) return null;
  const hint = m[1].trim().replace(/\s+/g, " ");
  // Drop bare pronouns / filler that aren't a category.
  if (/^(it|me|that|this|them|us|the books?)$/i.test(hint)) return null;
  return hint.length >= 2 ? hint : null;
}

/**
 * Resolve a period phrase to inclusive YYYY-MM-DD bounds + a label. `now` is
 * injected so the tests are deterministic. Recognizes: Q1–Q4 [year], a bare year,
 * "last month" / "this month" / "this year" / "last year". Unrecognized → all-time.
 */
export function resolvePeriod(text: string, now: Date): { start: string | null; end: string | null; label: string } {
  const t = text.toLowerCase();
  const y = now.getFullYear();
  const ymd = (yr: number, mo: number, day: number) =>
    `${yr}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const lastDay = (yr: number, mo: number) => new Date(yr, mo, 0).getDate();

  const qMatch = t.match(/\bq([1-4])\b(?:[^\d]{0,6}(20\d\d))?/);
  if (qMatch) {
    const q = Number(qMatch[1]);
    const yr = qMatch[2] ? Number(qMatch[2]) : y;
    const startMo = (q - 1) * 3 + 1;
    const endMo = startMo + 2;
    return { start: ymd(yr, startMo, 1), end: ymd(yr, endMo, lastDay(yr, endMo)), label: `Q${q} ${yr}` };
  }
  if (/\bthis year\b/.test(t)) return { start: ymd(y, 1, 1), end: ymd(y, 12, 31), label: `${y}` };
  if (/\blast year\b/.test(t)) return { start: ymd(y - 1, 1, 1), end: ymd(y - 1, 12, 31), label: `${y - 1}` };
  if (/\bthis month\b/.test(t)) {
    const mo = now.getMonth() + 1;
    return { start: ymd(y, mo, 1), end: ymd(y, mo, lastDay(y, mo)), label: `this month` };
  }
  if (/\blast month\b/.test(t)) {
    const d = new Date(y, now.getMonth() - 1, 1);
    const yr = d.getFullYear(); const mo = d.getMonth() + 1;
    return { start: ymd(yr, mo, 1), end: ymd(yr, mo, lastDay(yr, mo)), label: `last month` };
  }
  const yrMatch = t.match(/\b(20\d\d)\b/);
  if (yrMatch) {
    const yr = Number(yrMatch[1]);
    return { start: ymd(yr, 1, 1), end: ymd(yr, 12, 31), label: `${yr}` };
  }
  return { start: null, end: null, label: "all time" };
}

/**
 * Classify one owner message. Pure: no model, no DB, deterministic given `now`.
 * The fn calls this SAME routine (shared code, ported) so the client and server
 * agree on what is answerable — the client never sends an unsupported turn as a
 * grounded question, and the server re-checks before spending a model call.
 */
export function routeMessage(raw: string, now: Date = new Date()): ThreadRoute {
  const text = (raw ?? "").trim();
  if (!text) return { intent: "unsupported" };
  if (GREETING_RE.test(text)) return { intent: "greeting" };
  if (ACTIVITY_RE.test(text)) return { intent: "activity" };

  // Advice / prediction / off-books topics are refused even if money-ish — a
  // ledger fact is retrospective, not advice.
  if (ADVICE_RE.test(text)) return { intent: "unsupported" };

  const metric = metricFor(text);
  const anchored = MONEY_RE.test(text);
  if (metric && anchored) {
    const period = resolvePeriod(text, now);
    return {
      intent: "question",
      query: {
        metric,
        categoryHint: metric === "spend" || metric === "income" ? categoryHintFor(text) : null,
        period: { start: period.start, end: period.end },
        periodLabel: period.label,
      },
    };
  }
  return { intent: "unsupported" };
}
