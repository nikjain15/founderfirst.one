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
 * Owner-INITIATED questions here are NOT interruptions (Nik, 3 Jul), so they do
 * NOT consume the ≤5/week interruption budget — that budget governs Penny's own
 * low-confidence asks (surfaced in Categorize), so the thread shows a plain,
 * non-numeric hint, not a counter it doesn't govern (Wave-3 audit F2). All copy
 * is COPY.thread (CENTRAL-1 grep gate); Penny's answer prose is the live persona.
 */
import { useEffect, useRef, useState } from "react";
import type { JournalEntry } from "./types";
import { askPennyThread, usePennyActivity, fetchPennyThread, appendPennyThread, type ThreadFact } from "./api";
import { computeMetric, routeMessage } from "./thread";
import { COPY } from "../copy";

type Turn = { id: number; who: "you" | "penny"; text: string; pending?: boolean };

// Persist the conversation per org so Penny "remembers" — she's a standing chat, not
// a slab that resets on every visit (owner-calm redesign). Local for now (survives
// navigation + reload on this device); server-side cross-device history is a follow-up.
const STORE_PREFIX = "ff.penny.thread.";
const STORE_MAX = 100;

function loadTurns(orgId: string): Turn[] {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + orgId);
    if (raw) {
      const arr = JSON.parse(raw) as Turn[];
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch { /* ignore malformed/absent storage */ }
  return [{ id: 0, who: "penny", text: COPY.thread.greeting }];
}

export default function PennyThread({
  orgId, entries, canWrite, compact = false,
}: {
  orgId: string; entries: JournalEntry[]; canWrite: boolean; compact?: boolean;
}) {
  const activity = usePennyActivity(orgId);

  const [turns, setTurns] = useState<Turn[]>(() => loadTurns(orgId));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listEnd = useRef<HTMLDivElement>(null);
  // Monotonic id above anything restored from storage, so keys never collide.
  const seq = useRef(Math.max(0, ...turns.map((t) => t.id)) + 1);

  // Persist on every settled change (drop the transient "pending" turn).
  useEffect(() => {
    try {
      localStorage.setItem(
        STORE_PREFIX + orgId,
        JSON.stringify(turns.filter((t) => !t.pending).slice(-STORE_MAX)),
      );
    } catch { /* storage full / unavailable — history just won't persist */ }
  }, [turns, orgId]);

  // Cross-device memory: load the server-remembered conversation once per org.
  // localStorage seeded the instant view above; if the server has history it wins,
  // so the same books' thread follows the user across tabs and devices.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadedFor.current === orgId) return;
    loadedFor.current = orgId;
    let cancelled = false;
    void fetchPennyThread(orgId).then((rows) => {
      if (cancelled || rows.length === 0) return;
      const restored: Turn[] = rows.map((r, i) => ({ id: i + 1, who: r.role, text: r.body }));
      seq.current = restored.length + 1;
      setTurns(restored);
    }).catch(() => { /* offline / unauthed — keep the localStorage view */ });
    return () => { cancelled = true; };
  }, [orgId]);

  // Best-effort mirror of a settled turn to the server thread (fallback = localStorage).
  function remember(role: "you" | "penny", text: string) {
    void appendPennyThread(orgId, role, text).catch(() => { /* keep local-only */ });
  }

  function push(turn: Turn) {
    setTurns((t) => [...t, turn]);
    // Scroll the newest turn into view after paint.
    requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    push({ id: seq.current++, who: "you", text: q });
    remember("you", q);
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
      push({ id: seq.current++, who: "penny", text: localReply });
      remember("penny", localReply);
      setBusy(false);
      return;
    }

    const pendingId = seq.current++;
    push({ id: pendingId, who: "penny", text: COPY.thread.sending, pending: true });
    try {
      const { text: reply } = await askPennyThread(orgId, q, fact);
      setTurns((t) => t.map((x) => (x.id === pendingId ? { ...x, text: reply, pending: false } : x)));
      remember("penny", reply);
    } catch {
      setTurns((t) => t.map((x) => (x.id === pendingId ? { ...x, text: COPY.thread.error, pending: false } : x)));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
  }

  return (
    <section className={`penny-thread${compact ? " penny-thread-compact" : ""}`} aria-label={COPY.thread.title}>
      {/* In the dock the panel header carries the title, so drop the in-thread head
          to a single lead line; standalone (legacy) keeps the full heading block. */}
      {compact ? (
        // Only until the first question — once the chat is going the intro just
        // eats space (Nik). It reappears on a fresh thread.
        !turns.some((t) => t.who === "you") && (
          <p className="muted sm thread-lead-compact">{COPY.thread.lead}</p>
        )
      ) : (
        <div className="thread-head">
          <h2 className="section-h">
            <span className="p-mark p-mark-sm" aria-hidden="true">P</span> {COPY.thread.title}
          </h2>
          <p className="muted sm">{COPY.thread.lead}</p>
          <p className="thread-budget muted sm">{COPY.thread.askHint}</p>
        </div>
      )}

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
