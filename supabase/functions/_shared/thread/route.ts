/**
 * Penny-thread routing + grounded-fact computation — SERVER copy (card W3.1, P2-1).
 *
 * This is a Deno-side PORT of apps/app/src/ledger/thread.ts (+ the report math it
 * reuses from ledger/reports.ts). It exists so the penny-thread edge fn can be the
 * grounding AUTHORITY: it re-routes the owner's message and re-computes the fact
 * from the org's OWN ledger with the service role, rather than trusting whatever the
 * client POSTs. The two copies MUST agree — the client and this file share the exact
 * regexes, period resolver, and report math, and a Deno test asserts parity against
 * a set of cases. If you change one, change the other.
 *
 * Pure + DB-free: no I/O here. The fn does the service-role SELECT and hands the
 * resulting entries to computeMetric.
 */

// ── ledger row shapes (mirror apps/app/src/ledger/types.ts, read side) ────────
export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export interface JournalLine {
  account_id: string;
  amount_minor: number;
  side: "D" | "C";
  account?: { code?: string | null; name?: string | null; type?: AccountType | null } | null;
}
export interface JournalEntry {
  entry_date: string;
  status: string; // 'posted' | 'pending_review' | 'reversed'
  lines: JournalLine[];
}

// ── report math (mirror apps/app/src/ledger/reports.ts) ───────────────────────
const inBooks = (e: JournalEntry) => e.status !== "pending_review";

interface AccountBalance {
  account_id: string; code: string | null; name: string; type: AccountType;
  debit: number; credit: number;
}

function accountBalances(entries: JournalEntry[], dateFilter?: (d: string) => boolean): AccountBalance[] {
  const map = new Map<string, AccountBalance>();
  for (const e of entries) {
    if (!inBooks(e)) continue;
    if (dateFilter && !dateFilter(e.entry_date)) continue;
    for (const l of e.lines ?? []) {
      const cur = map.get(l.account_id) ?? {
        account_id: l.account_id,
        code: l.account?.code ?? null,
        name: l.account?.name ?? "—",
        type: (l.account?.type ?? "asset") as AccountType,
        debit: 0, credit: 0,
      };
      if (l.side === "D") cur.debit += l.amount_minor;
      else cur.credit += l.amount_minor;
      map.set(l.account_id, cur);
    }
  }
  return [...map.values()];
}

interface PnlLine { name: string; code: string | null; amount: number; }
function profitAndLoss(entries: JournalEntry[], dateFilter?: (d: string) => boolean) {
  const balances = accountBalances(entries, dateFilter);
  const income: PnlLine[] = [];
  const expense: PnlLine[] = [];
  let totalIncome = 0;
  let totalExpense = 0;
  for (const b of balances) {
    if (b.type === "income") {
      const amount = b.credit - b.debit;
      if (amount !== 0) income.push({ name: b.name, code: b.code, amount });
      totalIncome += amount;
    } else if (b.type === "expense") {
      const amount = b.debit - b.credit;
      if (amount !== 0) expense.push({ name: b.name, code: b.code, amount });
      totalExpense += amount;
    }
  }
  return { income, expense, totalIncome, totalExpense, netIncome: totalIncome - totalExpense };
}

/** Total assets (debit-normal) as of `asOf` (inclusive). Mirrors balanceSheet. */
function totalAssetsAsOf(entries: JournalEntry[], asOf?: string): number {
  const filter = asOf ? (d: string) => d <= asOf : undefined;
  let total = 0;
  for (const b of accountBalances(entries, filter)) {
    if (b.type === "asset") total += b.debit - b.credit;
  }
  return total;
}

// ── routing types (mirror thread.ts) ──────────────────────────────────────────
export type ThreadIntent = "greeting" | "activity" | "question" | "unsupported";
export type MetricKind = "spend" | "income" | "net" | "cash";

export interface GroundedQuery {
  metric: MetricKind;
  categoryHint: string | null;
  period: { start: string | null; end: string | null };
  periodLabel: string;
}
export interface ThreadRoute { intent: ThreadIntent; query?: GroundedQuery; }

export interface GroundedFact {
  metric: MetricKind;
  amountMinor: number;
  categoryLabel: string | null;
  periodLabel: string;
  categoryUnmatched: boolean;
}

const dateInRange = (start: string | null, end: string | null) =>
  (d: string) => (start ? d >= start : true) && (end ? d <= end : true);

export function computeMetric(entries: JournalEntry[], q: GroundedQuery): GroundedFact {
  const filter = dateInRange(q.period.start, q.period.end);
  const hint = q.categoryHint?.toLowerCase().trim() || null;
  const matchAcct = (name: string, code: string | null) =>
    hint != null && (name.toLowerCase().includes(hint) || (code ?? "").toLowerCase() === hint);

  if (q.metric === "cash") {
    const amt = totalAssetsAsOf(entries, q.period.end ?? undefined);
    return { metric: "cash", amountMinor: amt, categoryLabel: null, periodLabel: q.periodLabel, categoryUnmatched: false };
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

// ── routing (mirror thread.ts EXACTLY) ────────────────────────────────────────
const GREETING_RE = /^\s*(hi|hey|hello|yo|howdy)(\s+penny)?[\s!.,?]*$|^\s*good\s+(morning|afternoon|evening)[\s!.,?]*$|^\s*penny[\s!.,?]*$/i;
const ACTIVITY_RE = /\b(what('?s| is| have you| did you)?\s*(new|done|up|been up to|happening|going on)|catch me up|any(thing)? (new|news|updates?)|what did you do)\b/i;
const MONEY_RE = /\b(spend|spent|spending|cost|costs?|paid|pay|expense|expenses|income|revenue|earn|earned|made|make|bring in|brought in|sales?|profit|net|cash|balance|money|bottom line)\b/i;
const ADVICE_RE = /\b(should i|advice|recommend|what if|predict|prediction|forecast|project|projection|projected|estimate|estimated|will\s+(i|my|it|the|we)|going to|next (quarter|month|year|week)|tax (advice|strategy|planning)|deductible|write.?off|invest|stock|weather|joke)\b/i;

function metricFor(text: string): MetricKind | null {
  const t = text.toLowerCase();
  if (/\b(cash|bank balance|how much (money )?do i have|in the bank)\b/.test(t)) return "cash";
  if (/\b(net|profit|make|made|bottom line)\b/.test(t)) return "net";
  if (/\b(income|revenue|earn|earned|sales?|bring in|brought in)\b/.test(t)) return "income";
  if (/\b(spend|spent|spending|cost|costs?|paid|pay|expense|expenses)\b/.test(t)) return "spend";
  return null;
}

function categoryHintFor(text: string): string | null {
  const m = text.match(/\b(?:on|for|to)\s+([a-z][a-z0-9 &/'-]{1,40}?)(?:\s+(?:in|during|last|this|for|q[1-4]|20\d\d|month|year|quarter)\b|[?.!,]|$)/i);
  if (!m) return null;
  const hint = m[1].trim().replace(/\s+/g, " ");
  if (/^(it|me|that|this|them|us|the books?)$/i.test(hint)) return null;
  return hint.length >= 2 ? hint : null;
}

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

// ── deterministic phrasing helpers (used by the fn's model-off fallback) ──────
// Kept here (pure) so they're unit-testable without importing index.ts (which calls
// Deno.serve at load). Format minor units so the exact figure is pre-rendered.
export function money(minor: number): string {
  const neg = minor < 0;
  const v = Math.abs(minor) / 100;
  const s = v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return neg ? `(${s})` : s;
}

export function metricPhrase(f: GroundedFact): string {
  const amt = money(f.amountMinor);
  const where = f.categoryLabel ? ` on ${f.categoryLabel}` : "";
  const when = f.periodLabel && f.periodLabel !== "all time" ? ` in ${f.periodLabel}` : " (all time)";
  switch (f.metric) {
    case "spend": return `The business spent ${amt}${where}${when}.`;
    case "income": return `The business brought in ${amt}${where}${when}.`;
    case "net": return `Net income was ${amt}${when}.`;
    case "cash": return `Cash and assets stand at ${amt}${f.periodLabel && f.periodLabel !== "all time" ? ` as of ${f.periodLabel}` : ""}.`;
  }
}

/**
 * Grounding guard (audit Program 4, F4). The model is told to state ONE money
 * figure — the server-computed one — and to add no other numbers, estimates, or
 * percentages. This checks the reply for that contract and returns true if it is
 * VIOLATED, so the caller can fall back to the deterministic (correct) phrasing.
 *
 * A violation is any of:
 *   • a percentage claim (`15%`, `15 %`, or the word "percent") — always forbidden,
 *   • a currency token ($-prefixed OR the `($x.xx)` negative form) that isn't the
 *     single allowed figure.
 *
 * Deliberately conservative to avoid nuking legitimate answers: bare integers
 * (years like "2026", quarters like "Q2", account counts) do NOT trip it — only
 * money-shaped and percent-shaped tokens do. The allowed figure is compared after
 * stripping formatting so "$200.00" / "($200.00)" / "200.00" all count as allowed.
 */
export function groundingViolation(text: string, allowedMoney: string): boolean {
  const norm = (s: string) => s.replace(/[^0-9.]/g, ""); // digits + decimal only
  const allowed = norm(allowedMoney);

  // Any percentage is forbidden outright (the prompt bans percentages/estimates).
  if (/\d\s*%/.test(text) || /\bpercent\b/i.test(text)) return true;

  // Every currency-shaped token must be the allowed figure.
  //  - $-prefixed:            $1,234.50 / $200 / $200.00
  //  - parenthesized negative: ($200.00)
  const moneyTokens = text.match(/\$\s?[\d,]+(?:\.\d+)?|\(\s?\$?[\d,]+(?:\.\d+)?\s?\)/g) ?? [];
  for (const tok of moneyTokens) {
    if (norm(tok) !== allowed) return true;
  }
  return false;
}

// Baked deterministic decline / connect-books copy. The live 'app' persona may
// override each via a labeled line so editing the persona changes the thread's
// deterministic output (P2-2); absent an override these baked defaults are used.
// Q&A-appropriate — NEVER the categorize prompt's 'return an account_id' framing.
export const DECLINE_DEFAULT =
  "That's not something I can pull from your books — I can answer questions about " +
  "your income, spending, profit, and cash. Ask me one of those and I'll get you the " +
  "exact figure.";
export const CONNECT_BOOKS_DEFAULT =
  "I don't have any books to look at yet — connect your bank or accounting so I can " +
  "start answering questions about your money.";

/** Pull a `[thread:<tag>] …` override line out of the persona body, if present. */
export function personaOverride(persona: string, tag: string): string | null {
  const m = persona.match(new RegExp(`\\[thread:${tag}\\]\\s*(.+?)\\s*(?:\\n|$)`, "i"));
  return m ? m[1].trim() : null;
}

export function routeMessage(raw: string, now: Date = new Date()): ThreadRoute {
  const text = (raw ?? "").trim();
  if (!text) return { intent: "unsupported" };
  if (GREETING_RE.test(text)) return { intent: "greeting" };
  if (ACTIVITY_RE.test(text)) return { intent: "activity" };
  if (ADVICE_RE.test(text)) return { intent: "unsupported" };

  const metric = metricFor(text);
  const anchored = MONEY_RE.test(text);
  if (metric && anchored) {
    const period = resolvePeriod(text, now);
    const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (period.start && period.start > todayYmd) return { intent: "unsupported" };
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
