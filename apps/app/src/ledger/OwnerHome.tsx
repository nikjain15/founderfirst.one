/**
 * Owner Home — the "am I okay?" pulse (card W3.4, APP_PRINCIPLES §2).
 *
 * ONE screen that answers the owner's only real question at a glance:
 *   • Money on hand (cash position)         — derived from the ledger (ownerHome.ts)
 *   • Needs you (→ Review)                   — the W3.2 queue count, links into Review
 *   • Coming up (filing deadlines)           — the CENTRAL-2 kernel calendar (never hardcoded)
 *   • Reconciled ✓                           — the W1.1 reconciliation status
 *   • What Penny did                         — the W3.2 "Penny did this" feed (+ undo)
 *   • Your month so far                      — a plain-English, comparative summary (theme #8)
 *   • Catch-up progress                      — the W2.1 per-year meter, only when present
 *
 * Every number reuses data the app already loads (entries/accounts pages are
 * RPTTEST-paginated in api.ts) — no new store. All copy comes from the CENTRAL-1
 * catalog (the 'app' voice), no inline strings. The estimated-taxes strip is now
 * LIVE (W2.4): it grounds a quarterly estimate on the same P&L, reads law-derived
 * rates from the kernel, and cleanly omits the number when there's no tax profile /
 * no seeded rates / no profit (never faked).
 *
 * This is Home (the owner-lens `overview` surface) — NOT a new top-level tab
 * (usability gate) and disjoint from the W3.1 thread surface.
 */
import { useMemo } from "react";
import {
  useCatchUpProgress, useReconciliationStatus, useUpcomingDeadlines, type FilingDeadline,
} from "./api";
import { cashPosition, monthlySummary, needsYouCount } from "./homePulse";
import EstimatedTaxes from "./EstimatedTaxes";
import { formatMoney, formatMoneyShort } from "./money";
import PennyDidThis from "./PennyDidThis";
import { Takeaway } from "./Takeaway";
import type { JournalEntry, LedgerAccount } from "./types";
import { COPY } from "../copy";

const entryTotal = (e: JournalEntry) =>
  (e.lines ?? []).filter((l) => l.side === "D").reduce((s, l) => s + l.amount_minor, 0);

export default function OwnerHome({
  entries, accounts, canWrite, orgId, onReview, onRefresh,
}: {
  entries: JournalEntry[];
  accounts: LedgerAccount[];
  canWrite: boolean;
  orgId: string;
  onReview: () => void;
  onRefresh: () => void;
}) {
  // Derivations — pure, over the same entries the Reports tab renders (tie to cent).
  const cash = useMemo(() => cashPosition(entries, accounts), [entries, accounts]);
  const summary = useMemo(() => monthlySummary(entries, new Date()), [entries]);
  const needsYou = useMemo(() => needsYouCount(entries, accounts), [entries, accounts]);
  const recent = entries.slice(0, 5);

  const recon = useReconciliationStatus(orgId);
  const deadlines = useUpcomingDeadlines(orgId);
  const catchUp = useCatchUpProgress(orgId);

  // First run: no chart of accounts yet → the setup nudge lives in the shared
  // Overview path; OwnerHome only renders once there are books, so we keep it
  // focused. (Ledger routes accounts.length === 0 to the setup Empty already.)

  return (
    <div className="overview owner-home">
      {/* The one so-what line, biased to the most actionable thing. */}
      <HomeTakeaway needsYou={needsYou} canWrite={canWrite} onReview={onReview} />

      {/* Pulse tiles: money on hand + needs-you. */}
      <div className="kpis home-kpis">
        <div className="kpi">
          <span className="kpi-label">{COPY.ownerHome.cashLabel}</span>
          <span className="kpi-value">{formatMoneyShort(cash.cashMinor)}</span>
          <span className="kpi-sub muted sm">
            {cash.fromCashAccounts ? COPY.ownerHome.cashSubCash : COPY.ownerHome.cashSubAssets}
          </span>
        </div>
        <button
          type="button"
          className={`kpi kpi-btn${needsYou ? " t-warn" : ""}`}
          onClick={onReview}
          aria-label={COPY.ownerHome.needsYouLabel}
        >
          <span className="kpi-label">{COPY.ownerHome.needsYouLabel}</span>
          <span className={`kpi-value${needsYou ? " t-warn" : ""}`}>{needsYou}</span>
          <span className="kpi-sub muted sm">
            {needsYou ? COPY.ownerHome.needsYouSome(needsYou) : COPY.ownerHome.needsYouNone}
          </span>
        </button>
      </div>

      {/* Reconciled ✓ (W1.1) — read-only chip; owners never reconcile. */}
      {recon.data && recon.data.lockedCount > 0 && (
        <p className="reconciled-chip">
          {COPY.reconcile.homeReconciled(recon.data.lockedCount)}
          {recon.data.latestLockedAt &&
            ` ${COPY.reconcile.homeReconciledDate(recon.data.latestLockedAt.slice(0, 10))}`}
        </p>
      )}

      {/* Your month so far — plain-English comparative summary (theme #8). */}
      <section className="home-summary">
        <h2 className="section-h">{COPY.ownerHome.summaryTitle}</h2>
        <p className="home-summary-text">{monthSentence(summary)}</p>
      </section>

      {/* Coming up — kernel-driven filing deadlines (never a hardcoded calendar). */}
      <ComingUp q={deadlines} />

      {/* Estimated taxes (W2.4) — grounded on the same P&L + kernel rates; the
          strip omits itself cleanly when there's no profile / rates / profit. */}
      <EstimatedTaxes entries={entries} orgId={orgId} />

      {/* Catch-up progress (W2.1) — only when a catch-up is in flight. */}
      <CatchUpStrip years={catchUp.data ?? []} />

      {/* What Penny did (W3.2 feed + 1-tap undo). */}
      <PennyDidThis orgId={orgId} canWrite={canWrite} onChange={onRefresh} />

      {/* Latest activity. */}
      <section className="home-activity">
        <h2 className="section-h">{COPY.ownerHome.activityTitle}</h2>
        {recent.length === 0 ? (
          <p className="muted">{COPY.ownerHome.noEntries}</p>
        ) : (
          <ul className="activity">
            {recent.map((e) => (
              <li key={e.id}>
                <span className="a-date">{e.entry_date}</span>
                <span className="a-memo">{e.memo ?? e.source}</span>
                <span className="a-amt">{formatMoney(entryTotal(e))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Build the plain-English month summary sentence purely from copy + numbers. */
export function monthSentence(s: ReturnType<typeof monthlySummary>): string {
  if (!s.hasThisMonth) return COPY.ownerHome.summaryQuiet;
  let out = COPY.ownerHome.summaryNet(formatMoney(s.netMinor));
  if (!s.hasPrev) {
    out += COPY.ownerHome.summaryNoPrev;
  } else if (s.direction === "up") {
    out += COPY.ownerHome.summaryUpFromLast(formatMoney(Math.abs(s.deltaMinor)));
  } else if (s.direction === "down") {
    out += COPY.ownerHome.summaryDownFromLast(formatMoney(Math.abs(s.deltaMinor)));
  } else {
    out += COPY.ownerHome.summaryFlatFromLast;
  }
  return out;
}

function HomeTakeaway({
  needsYou, canWrite, onReview,
}: {
  needsYou: number;
  canWrite: boolean;
  onReview: () => void;
}) {
  if (needsYou > 0) {
    return (
      <Takeaway tone="watch" action={canWrite ? { label: COPY.ownerHome.needsYouAction, onClick: onReview } : undefined}>
        {COPY.ownerHome.needsYouSome(needsYou)}
      </Takeaway>
    );
  }
  return <Takeaway tone="good">{COPY.ownerHome.needsYouNone}</Takeaway>;
}

function ComingUp({ q }: { q: ReturnType<typeof useUpcomingDeadlines> }) {
  const rows = q.data ?? [];
  return (
    <section className="home-deadlines">
      <h2 className="section-h">{COPY.ownerHome.deadlinesTitle}</h2>
      {q.isLoading ? null : rows.length === 0 ? (
        // No rows means "no tax profile set" OR "genuinely nothing due" — either
        // way we keep it warm and non-blocking. The entity/jurisdiction that drives
        // this gets set in onboarding (W3.3); no calendar is ever hardcoded here.
        <p className="muted">{COPY.ownerHome.deadlinesNone}</p>
      ) : (
        <ul className="deadlines-list">
          {rows.map((d, i) => (
            // The kernel returns deadlines ordered by due date, so the FIRST row is
            // the nearest one — highlight it by position, not a hardcoded day window.
            <DeadlineRow key={d.obligation_key} d={d} isNearest={i === 0} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DeadlineRow({ d, isNearest }: { d: FilingDeadline; isNearest: boolean }) {
  return (
    <li className={`deadline-row${isNearest ? " is-soon" : ""}`}>
      <span className="dl-label">{d.form_code ? `${d.form_code} · ${d.label}` : d.label}</span>
      <span className="dl-due">
        {COPY.ownerHome.deadlineDue(d.days_until)} · {COPY.ownerHome.deadlineOn(d.due_date)}
      </span>
    </li>
  );
}

function CatchUpStrip({ years }: { years: { year: number; done: boolean; uncategorized: number }[] }) {
  if (years.length === 0) return null;
  return (
    <section className="home-catchup">
      <ul className="catchup-years">
        {years.map((y) => (
          <li key={y.year} className={`catchup-year${y.done ? " is-done" : ""}`}>
            <span className="cu-year">{y.year}</span>
            <span className="cu-state">{y.done ? COPY.ownerHome.catchUpDone : COPY.ownerHome.catchUpToGo(y.uncategorized)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
