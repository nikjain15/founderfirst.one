/**
 * Penny thread — the conversational surface on the owner's REAL books (card W3.1).
 *
 * Nests inside Home (owner nav, APP_PRINCIPLES §2) — NO new top-level tab. Penny
 * greets, narrates the "Penny did this" feed (W3.2), and answers grounded questions
 * about the actual ledger. The grounding is airtight: the NUMBER in every answer is
 * computed here from the SAME paginated entries the reports use (thread.ts
 * computeMetric → ties to the cent), and the penny-thread fn only phrases it in
 * Penny's live 'app' voice. An out-of-scope question is declined, never invented.
 *
 * The thread is where the week's ≤5 asks surface (honest budget line), not a
 * separate inbox. All copy is COPY.thread (CENTRAL-1 grep gate); Penny's answer
 * prose is the live persona.
 */
import { useRef, useState } from "react";
import type { JournalEntry } from "./types";
import { askPennyThread, usePennyActivity, useAskBudget, type ThreadFact } from "./api";
import { computeMetric, routeMessage } from "./thread";
import { useBehaviorConfig, CONFIG_DEFAULTS } from "../copy";
import { COPY } from "../copy";

type Turn = { id: number; who: "you" | "penny"; text: string; pending?: boolean };

let TURN_SEQ = 1;

export default function PennyThread({
  orgId, entries, canWrite,
}: {
  orgId: string; entries: JournalEntry[]; canWrite: boolean;
}) {
  const activity = usePennyActivity(orgId);
  const budgetQ = useAskBudget(orgId);
  const cfg = useBehaviorConfig(orgId).data ?? CONFIG_DEFAULTS;
  const spent = budgetQ.data?.spent ?? 0;
  const budget = cfg.asks_per_week;

  const [turns, setTurns] = useState<Turn[]>([
    { id: 0, who: "penny", text: COPY.thread.greeting },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listEnd = useRef<HTMLDivElement>(null);

  function push(turn: Turn) {
    setTurns((t) => [...t, turn]);
    // Scroll the newest turn into view after paint.
    requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    push({ id: TURN_SEQ++, who: "you", text: q });
    setBusy(true);

    // Route + ground CLIENT-SIDE so the number is deterministic and ties to the
    // reports. The fn never computes a figure; a null fact = an out-of-scope
    // decline (Penny says what she can answer, never invents a number).
    const route = routeMessage(q, new Date());
    let fact: ThreadFact | null = null;
    let localReply: string | null = null;

    if (route.intent === "greeting") {
      localReply = COPY.thread.greeting;
    } else if (route.intent === "activity") {
      const rows = activity.data ?? [];
      localReply = rows.length ? COPY.thread.activityIntro : COPY.thread.activityNone;
    } else if (route.intent === "question" && route.query) {
      const f = computeMetric(entries, route.query);
      // A named category that matched no account → decline (don't report 0 as real).
      if (!f.categoryUnmatched) {
        fact = {
          metric: f.metric, amount_minor: f.amountMinor,
          category_label: f.categoryLabel, period_label: f.periodLabel,
        };
      }
    }

    // Greeting / activity are answered locally (no model spend). Questions +
    // unsupported turns go to the fn for Penny's voice (grounded fact or decline).
    if (localReply != null) {
      push({ id: TURN_SEQ++, who: "penny", text: localReply });
      setBusy(false);
      return;
    }

    const pendingId = TURN_SEQ++;
    push({ id: pendingId, who: "penny", text: COPY.thread.sending, pending: true });
    try {
      const { text: reply } = await askPennyThread(orgId, q, fact);
      setTurns((t) => t.map((x) => (x.id === pendingId ? { ...x, text: reply, pending: false } : x)));
    } catch {
      setTurns((t) => t.map((x) => (x.id === pendingId ? { ...x, text: COPY.thread.error, pending: false } : x)));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
  }

  return (
    <section className="penny-thread" aria-label={COPY.thread.title}>
      <div className="thread-head">
        <h2 className="section-h">
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span> {COPY.thread.title}
        </h2>
        <p className="muted sm">{COPY.thread.lead}</p>
        <p className="thread-budget muted sm">
          {spent > 0 ? COPY.thread.budgetSpent(spent, budget) : COPY.thread.budgetClear(budget)}
        </p>
      </div>

      <div className="thread-turns" role="log" aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} className={`thread-turn t-${t.who}${t.pending ? " is-pending" : ""}`}>
            <span className="turn-who">{t.who === "you" ? COPY.thread.youLabel : COPY.thread.pennyLabel}</span>
            <span className="turn-text">{t.text}</span>
          </div>
        ))}
        <div ref={listEnd} />
      </div>

      {!canWrite && <p className="muted sm">{COPY.thread.readOnly}</p>}

      <div className="thread-suggest">
        {[COPY.thread.suggestSpend, COPY.thread.suggestIncome, COPY.thread.suggestCash].map((s) => (
          <button key={s} type="button" className="ghost sm" disabled={busy} onClick={() => ask(s)}>{s}</button>
        ))}
      </div>

      <form
        className="thread-input"
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={COPY.thread.inputPlaceholder}
          aria-label={COPY.thread.inputAria}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? COPY.thread.sending : COPY.thread.send}
        </button>
      </form>
    </section>
  );
}
