/**
 * Ledger workspace — the read-side books (chart of accounts, journal browser,
 * trial balance / P&L / balance sheet) plus the write actions wired to the
 * Phase 2 Edge-Function write-path. One component, used by both lenses; the
 * owner defaults to Overview ("how's my business"), the CPA to the Journal.
 *
 * Reads are RLS-scoped; every mutation is gated by `canWrite` in the UI AND
 * enforced server-side (can_write_org) — the disabled button is a courtesy, not
 * the control (ARCHITECTURE.md §1, §6).
 */
import { useEffect, useMemo, useState } from "react";
import {
  approveEntry, logReportExport, newIdempotencyKey, postEntry, reverseEntry, setPeriod,
  upsertAccount, useAccounts, useEntries, useLedgerRefresh, usePeriods,
  useReconciliationStatus, useNecSummary,
} from "./api";
import { arApAging, balanceSheet, cashFlow, generalLedger, profitAndLoss, trialBalance, necSummary } from "./reports";
import {
  downloadReport, rangeFilter, type ExportContext, type ReportKind, type ReportScope,
} from "./export";
import { formatMoney, formatMoneyShort, parseMoneyToMinor } from "./money";
import { hasLedgerActivity } from "./overview";
import { ACCOUNT_TYPES } from "./types";
import ImportFlow from "../import/ImportFlow";
import CatchUpFlow from "../catchup/CatchUpFlow";
import Categorize from "./Categorize";
import Receipts, { ReceiptBadge } from "./Receipts";
import OwnerHome from "./OwnerHome";
import Invoicing from "./Invoicing";
import Bills from "./Bills";
import PayoutUpload from "../ecommerce/PayoutUpload";
import LearnedRules from "./LearnedRules";
import PennyDock from "./PennyDock";
import PennyDidThis from "./PennyDidThis";
import { SuggestionInbox, EntryCollab } from "./CollabUI";
import ReconcileView from "./ReconcileView";
import Filing from "../tax/Filing";
import InviteCpa from "../org/InviteCpa";
import { Takeaway } from "./Takeaway";
import {
  visibleTabs, visibleSubs as visibleSubsOf, reachableSurface, type Nav, type Surface,
} from "./nav";
import type {
  AccountType, AccountingPeriod, DraftLine, JournalEntry, LedgerAccount,
} from "./types";
import { COPY } from "../copy";

/**
 * Two navigations, one workspace (APP_PRINCIPLES §1, §2, §3). Owner and CPA are
 * role-scoped projections of the same books, so they share this component but get
 * their OWN tab set (defined in ./nav) — owner navigates by plain-language jobs,
 * CPA by accounting workflow. The `nav` prop picks which; the panels are identical.
 */

/** Roving-tabindex tab strip (arrow-key navigable) — shared by the main tabs and
 *  the Books sub-tabs so keyboard behavior is identical at both levels. */
function TabStrip<T extends string>({
  items, active, onSelect, label, idPrefix, className = "ledger-tabs",
}: {
  items: { id: T; label: string }[];
  active: T; onSelect: (id: T) => void;
  label: string; idPrefix: string; className?: string;
}) {
  return (
    <nav className={className} role="tablist" aria-label={label}>
      {items.map((t, i) => (
        <button
          key={t.id} role="tab" id={`${idPrefix}-${t.id}`}
          aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1}
          className={`ledger-tab${active === t.id ? " on" : ""}`}
          onClick={() => onSelect(t.id)}
          onKeyDown={(e) => {
            if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
            e.preventDefault();
            const n = items.length;
            const j = e.key === "ArrowRight" ? (i + 1) % n
              : e.key === "ArrowLeft" ? (i - 1 + n) % n
              : e.key === "Home" ? 0 : n - 1;
            onSelect(items[j].id);
            e.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[j]?.focus();
          }}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// Local date (en-CA → YYYY-MM-DD), not UTC — avoids a day-off near midnight/month-end.
const today = () => new Date().toLocaleDateString("en-CA");
const entryTotal = (e: JournalEntry) =>
  (e.lines ?? []).filter((l) => l.side === "D").reduce((s, l) => s + l.amount_minor, 0);

export default function Ledger({
  org, canWrite, nav = "owner", defaultTabId, initialSurface, eyebrow, onInvite,
}: {
  org: { id: string; name: string };
  canWrite: boolean;
  nav?: Nav;                 // which navigation to present (owner jobs vs CPA workflow)
  defaultTabId?: string;     // which primary tab to land on (else the first visible one)
  initialSurface?: Surface;  // land directly on a leaf surface (e.g. the CPA practice queue routes here)
  eyebrow?: string;
  onInvite?: () => void;     // owner-only: open Settings to invite an accountant (top-bar ⚙️ menu)
}) {
  // Visible primary tabs for this lens, with write-only tabs hidden for read-only.
  const tabs = visibleTabs(nav, canWrite);
  const initialTab = tabs.some((t) => t.id === defaultTabId) ? defaultTabId! : (tabs[0]?.id ?? "");
  const [tabId, setTabId] = useState<string>(initialTab);
  // Remember the last sub-surface per parent tab (Advanced / Books), so returning
  // to it lands where you left. Defaults to the parent's first visible sub.
  const [sub, setSub] = useState<Surface | null>(null);

  const activeTab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const subs = visibleSubsOf(activeTab, canWrite);
  const activeSub: Surface | null = activeTab?.subs
    ? (subs.find((s) => s.id === sub)?.id ?? subs[0]?.id ?? null)
    : null;
  // The leaf surface currently shown: a leaf tab's surface, or the active sub.
  const surface: Surface | null = activeTab?.surface ?? activeSub;

  const accounts = useAccounts(org.id);
  const entries = useEntries(org.id);
  const periods = usePeriods(org.id);
  const refresh = useLedgerRefresh(org.id);

  const loading = accounts.isLoading || entries.isLoading || periods.isLoading;
  const error = accounts.isError || entries.isError || periods.isError;

  // Jump straight to any surface, opening its parent tab if it's a sub-surface
  // (used by Home's actions and Import's onDone). Falls back to the leaf tab.
  const goto = (target: Surface) => {
    const parent = tabs.find((t) => t.surface === target)
      ?? tabs.find((t) => (t.subs ?? []).some((s) => s.id === target));
    if (!parent) return;
    setTabId(parent.id);
    if (parent.subs) setSub(target);
  };

  // Land directly on a requested leaf surface (the CPA practice queue deep-links
  // here). Re-runs when the surface changes so tapping a new queue item re-routes.
  // For a read_only CPA the queue's target tab (Categorize / Import) is write-only
  // and hidden, so route to the nearest surface they CAN view (the read-only Journal)
  // instead of no-op'ing — otherwise "View" on an uncategorized/unreconciled row does
  // nothing for read-only engagements.
  useEffect(() => {
    if (!initialSurface) return;
    const reachable = reachableSurface(nav, initialSurface, canWrite);
    if (reachable) goto(reachable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSurface]);

  return (
    <section className="lens ledger">
      <header className="ledger-head">
        {eyebrow && <p className="eyebrow lens-eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{org.name}</h1>
        {!canWrite && (
          <span className="readonly-chip">{COPY.ledger.readonlyChip}</span>
        )}
      </header>

      <TabStrip items={tabs} active={tabId} onSelect={setTabId}
        label={COPY.ledger.sectionsAria} idPrefix="ltab" />

      {error && <p className="error">{COPY.ledger.loadError}</p>}
      {loading && !error && <p className="muted">{COPY.common.loadingBooks}</p>}

      {!loading && !error && (
        <div className="ledger-panel" role="tabpanel" id="ledger-panel" aria-labelledby={`ltab-${tabId}`} tabIndex={0}>
          {activeTab?.subs && activeSub && (
            <TabStrip items={subs} active={activeSub} onSelect={setSub}
              label={COPY.ledger.subSectionsAria(activeTab.label)} idPrefix="lsub" className="ledger-tabs ledger-subtabs" />
          )}
          <div className={activeTab?.subs ? "ledger-subpanel" : undefined}
            role={activeTab?.subs ? "tabpanel" : undefined}
            aria-labelledby={activeTab?.subs && activeSub ? `lsub-${activeSub}` : undefined}
            tabIndex={activeTab?.subs ? 0 : undefined}>
            {surface === "overview" && (
              // Owner Home is the "am I okay?" pulse (W3.4): once there are books it
              // renders the cash / needs-you / deadlines / reconciled / Penny-did feed
              // dashboard; before any accounts exist it falls through to the shared
              // Overview's setup nudge. The CPA keeps the plain accounting Overview.
              nav === "owner" && (accounts.data?.length ?? 0) > 0 ? (
                // Owner-with-books Home is the W3.4 pulse dashboard. Penny's grounded
                // Q&A moved OFF Home into the global dock (owner-calm redesign) — she's
                // reachable from every tab now, not a slab stapled to the bottom here.
                <OwnerHome
                  entries={entries.data ?? []} accounts={accounts.data ?? []}
                  canWrite={canWrite} orgId={org.id}
                  onReview={() => goto("review")}
                  onRefresh={refresh}
                />
              ) : (
                <Overview
                  entries={entries.data ?? []} accounts={accounts.data ?? []}
                  canWrite={canWrite} orgId={org.id} nav={nav}
                  onReview={() => goto("review")}
                  onCategorize={() => goto("review")}
                  onConnect={() => goto("connections")}
                  onInvite={onInvite}
                  onChange={refresh}
                />
              )
            )}
            {surface === "review" && canWrite && (
              <>
                {/* Owner's trust-tiered needs-a-look: the CPA's pending suggestions
                    land here for approval before anything posts (card W1.5). */}
                {nav === "owner" && (
                  <SuggestionInbox orgId={org.id} accounts={accounts.data ?? []} onChange={refresh} />
                )}
                <Categorize orgId={org.id} canWrite={canWrite} accounts={accounts.data ?? []} onChange={refresh} />
                {/* Receipt capture + match (W3.5): snap/paste a receipt, Penny files
                    it with the right transaction; unmatched land in a queue here. */}
                <Receipts orgId={org.id} canWrite={canWrite} entries={entries.data ?? []} onChange={refresh} />
              </>
            )}
            {surface === "rules" && (
              <LearnedRules orgId={org.id} canWrite={canWrite} />
            )}
            {surface === "connections" && (
              <Connections orgId={org.id} canWrite={canWrite} accounts={accounts.data ?? []}
                onImported={() => { refresh(); goto("journal"); }} onInvite={onInvite}
                onReconcile={() => goto("reconcile")} onReports={() => goto("reports")} />
            )}
            {surface === "journal" && (
              <Journal orgId={org.id} canWrite={canWrite}
                accounts={accounts.data ?? []} entries={entries.data ?? []} onChange={refresh} />
            )}
            {surface === "accounts" && (
              <Accounts orgId={org.id} canWrite={canWrite}
                accounts={accounts.data ?? []} entries={entries.data ?? []} onChange={refresh} />
            )}
            {surface === "import" && canWrite && (
              <ImportFlow orgId={org.id} accounts={accounts.data ?? []}
                onDone={() => { refresh(); goto("journal"); }} />
            )}
            {surface === "periods" && (
              <Periods orgId={org.id} canWrite={canWrite}
                periods={periods.data ?? []} onChange={refresh} />
            )}
            {surface === "reconcile" && (
              <ReconcileView orgId={org.id} canWrite={canWrite}
                accounts={accounts.data ?? []} entries={entries.data ?? []}
                onCategorize={() => goto("review")} />
            )}
            {surface === "reports" && <Reports entries={entries.data ?? []} org={org} />}
            {surface === "filing" && <Filing orgId={org.id} entries={entries.data ?? []} orgName={org.name} />}
          </div>
        </div>
      )}

      {/* Global Penny dock (owner-calm redesign) — one standing chat, reachable from
          every owner tab, remembering this org's conversation. Owner-only; the CPA
          navigates by ledger workflow, not a chat. Mounted once so it floats over
          whichever tab is active and a question in flight survives a tab switch. */}
      {nav === "owner" && !loading && !error && (
        <PennyDock orgId={org.id} entries={entries.data ?? []} canWrite={canWrite} />
      )}
    </section>
  );
}

// ── Connections — "bring in / share my data" (APP_PRINCIPLES §2). Absorbs the old
//    Import tab and the InviteCpa sidebar so bank/connector/import/invite all live
//    under one owner-facing job instead of being scattered across the ledger. ─────
function Connections({
  orgId, canWrite, accounts, onImported, onInvite, onReconcile, onReports,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[];
  onImported: () => void; onInvite?: () => void;
  onReconcile?: () => void; onReports?: () => void;
}) {
  // Owner-calm redesign — the old mega single-scroll (every wizard expanded at once)
  // is now a CHOOSER: Connections defaults to a short menu of one-line jobs grouped
  // under the four cluster labels; picking one opens ONLY that flow full-width, with
  // a back link to the menu. One thing at a time, like the demo. Every connect /
  // upload / toggle surface + its callback props are UNCHANGED — they just render on
  // demand instead of all at once (regression.connections-wiring locks the wiring).
  const [open, setOpen] = useState<string | null>(null);

  const jobs: {
    id: string; cluster: string; title: string; desc: string; render: () => JSX.Element;
  }[] = [
    {
      id: "catchup", cluster: COPY.connections.clusterGetData,
      title: COPY.catchUp.entryTitle, desc: COPY.connections.menu.catchUpDesc,
      render: () => (
        <CatchUpFlow orgId={orgId} canWrite={canWrite} accounts={accounts}
          onDone={onReports ?? onImported} onReconcile={onReconcile} />
      ),
    },
    {
      id: "import", cluster: COPY.connections.clusterGetData,
      title: COPY.connections.bringInData, desc: COPY.connections.menu.importDesc,
      render: () => (
        canWrite
          ? <ImportFlow orgId={orgId} accounts={accounts} onDone={onImported} />
          : <p className="muted">{COPY.connections.importDisabled}</p>
      ),
    },
    {
      id: "payout", cluster: COPY.connections.clusterSellChannels,
      title: COPY.payouts.sectionTitle, desc: COPY.connections.menu.payoutDesc,
      render: () => <PayoutUpload orgId={orgId} canWrite={canWrite} accounts={accounts} />,
    },
    {
      id: "invoicing", cluster: COPY.connections.clusterMoney,
      title: COPY.invoicing.sectionTitle, desc: COPY.connections.menu.invoicingDesc,
      render: () => <Invoicing orgId={orgId} canWrite={canWrite} />,
    },
    {
      id: "bills", cluster: COPY.connections.clusterMoney,
      title: COPY.bills.sectionTitle, desc: COPY.connections.menu.billsDesc,
      render: () => <Bills orgId={orgId} canWrite={canWrite} />,
    },
    {
      id: "invite", cluster: COPY.connections.clusterSharing,
      title: COPY.connections.shareWithAccountant, desc: COPY.connections.menu.inviteDesc,
      render: () => (
        onInvite ? (
          <>
            <p className="muted sm">{COPY.connections.inviteLead}</p>
            <InviteCpa orgId={orgId} />
          </>
        ) : (
          <p className="muted sm">{COPY.connections.accountantManagedByOwner}</p>
        )
      ),
    },
  ];

  const active = jobs.find((j) => j.id === open);
  if (active) {
    return (
      <div className="connections conn-flow">
        <button type="button" className="conn-back" onClick={() => setOpen(null)}>
          {COPY.connections.back}
        </button>
        <h2 className="section-h conn-flow-title">{active.title}</h2>
        {active.render()}
      </div>
    );
  }

  // Chooser menu — grouped by the four clusters, one compact row per job.
  const clusters = [
    COPY.connections.clusterGetData, COPY.connections.clusterSellChannels,
    COPY.connections.clusterMoney, COPY.connections.clusterSharing,
  ];
  return (
    <div className="connections conn-chooser">
      {clusters.map((cluster) => (
        <section className="connections-cluster" key={cluster} aria-label={cluster}>
          <p className="eyebrow conn-cluster-h">{cluster}</p>
          <ul className="conn-menu">
            {jobs.filter((j) => j.cluster === cluster).map((j) => (
              <li key={j.id}>
                <button type="button" className="conn-menu-item" data-job={j.id}
                  onClick={() => setOpen(j.id)}>
                  <span className="conn-menu-text">
                    <span className="conn-menu-title">{j.title}</span>
                    <span className="conn-menu-desc muted sm">{j.desc}</span>
                  </span>
                  <span className="conn-menu-chevron" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ── Overview — plain-language "how's my business" ────────────────────────────
function Overview({
  entries, accounts, canWrite, orgId, nav, onReview, onCategorize, onConnect, onInvite, onChange,
}: {
  entries: JournalEntry[]; accounts: LedgerAccount[];
  canWrite: boolean; orgId: string; nav: Nav;
  onReview: () => void; onCategorize: () => void; onConnect: () => void;
  onInvite?: () => void; onChange?: () => void;
}) {
  const tb = useMemo(() => trialBalance(entries), [entries]);
  const pnl = useMemo(() => profitAndLoss(entries), [entries]);
  const bs = useMemo(() => balanceSheet(entries), [entries]);
  const pending = entries.filter((e) => e.status === "pending_review").length;
  const uncategorized = useMemo(() => {
    const u = accounts.find((a) => a.code === "9999" || a.name.toLowerCase() === "uncategorized");
    if (!u) return 0;
    return entries.filter((e) => e.status === "posted" && e.source !== "reversal"
      && (e.lines ?? []).some((l) => l.account_id === u.id)).length;
  }, [entries, accounts]);
  const recent = entries.slice(0, 5);
  // Owner-facing reconciliation status — read-only chip, no reconcile affordance.
  const recon = useReconciliationStatus(orgId);

  // First-time nudge to invite an accountant — the invite/approval controls now
  // live in Settings (not on every page). Shown once per org for owners, then
  // dismissible; always reachable in Settings afterward.
  const nudgeKey = `ff.inviteNudge.${orgId}`;
  const [inviteDismissed, setInviteDismissed] = useState(() => {
    try { return localStorage.getItem(nudgeKey) === "1"; } catch { return false; }
  });
  const dismissInvite = () => {
    try { localStorage.setItem(nudgeKey, "1"); } catch { /* private mode */ }
    setInviteDismissed(true);
  };
  const inviteNudge = onInvite && !inviteDismissed ? (
    <div className="invite-nudge">
      <span className="invite-nudge-text">{COPY.overview.inviteNudge}</span>
      <span className="invite-nudge-actions">
        <button className="ghost sm" onClick={() => { dismissInvite(); onInvite(); }}>{COPY.overview.inviteNudgeAction}</button>
        <button className="invite-nudge-x" aria-label={COPY.overview.dismissAria} onClick={dismissInvite}>×</button>
      </span>
    </div>
  ) : null;

  if (accounts.length === 0) {
    return (
      <>
        {inviteNudge}
        <Empty
          title={COPY.overview.setupTitle}
          body={COPY.overview.setupBody}
          action={canWrite ? { label: COPY.overview.goToConnections, onClick: onConnect } : undefined}
        />
        {/* Penny is present from day one via the global dock (owner-calm redesign) —
            she greets and can answer once books exist. No slab on this screen. */}
      </>
    );
  }
  return (
    <div className="overview">
      {inviteNudge}
      <OverviewTakeaway
        canWrite={canWrite}
        notBalanced={!tb.balanced}
        pending={pending}
        uncategorized={uncategorized}
        netIncome={pnl.netIncome}
        hasActivity={hasLedgerActivity(entries)}
        onReview={onReview}
        onCategorize={onCategorize}
      />
      {recon.data && recon.data.lockedCount > 0 && (
        <p className="reconciled-chip">
          {COPY.reconcile.homeReconciled(recon.data.lockedCount)}
          {recon.data.latestLockedAt && ` ${COPY.reconcile.homeReconciledDate(recon.data.latestLockedAt.slice(0, 10))}`}
        </p>
      )}
      <div className="kpis">
        <Kpi label={COPY.overview.kpiCashAssets} value={formatMoneyShort(bs.totalAssets)} />
        <Kpi label={COPY.overview.kpiNetIncome} value={formatMoneyShort(pnl.netIncome)}
          tone={pnl.netIncome >= 0 ? "good" : "bad"} />
        <Kpi label={COPY.overview.kpiNeedsReview} value={String(pending)} tone={pending ? "warn" : undefined} />
      </div>
      {!tb.balanced && (
        <p className="warn-banner">
          {COPY.overview.notBalancedBanner(formatMoney(Math.abs(tb.totalDebit - tb.totalCredit)))}
        </p>
      )}
      <h2 className="section-h">{COPY.overview.latestActivity}</h2>
      {recent.length === 0 ? (
        <p className="muted">{COPY.overview.noEntries}</p>
      ) : (
        <ul className="activity">
          {recent.map((e) => (
            <li key={e.id}>
              <span className="a-date">{e.entry_date}</span>
              <span className="a-memo">{e.memo ?? e.source}</span>
              <StatusPill status={e.status} />
              <span className="a-amt">{formatMoney(entryTotal(e))}</span>
            </li>
          ))}
        </ul>
      )}

      {/* "Penny did this" feed (W3.2) stays on Home — a calm one-line record of what
          she handled. Her Q&A conversation moved to the global dock (owner-calm
          redesign). Owner-only: the CPA navigates by ledger workflow, not a chat. */}
      {nav === "owner" && (
        <PennyDidThis orgId={orgId} canWrite={canWrite} onChange={onChange} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value${tone ? ` t-${tone}` : ""}`}>{value}</span>
    </div>
  );
}

// The one "so what / now what" line at the top of the Overview — bias toward the
// most actionable thing first (review → categorize → health), like /admin.
function OverviewTakeaway({
  canWrite, notBalanced, pending, uncategorized, netIncome, hasActivity, onReview, onCategorize,
}: {
  canWrite: boolean; notBalanced: boolean; pending: number; uncategorized: number;
  netIncome: number; hasActivity: boolean; onReview: () => void; onCategorize: () => void;
}) {
  if (notBalanced) {
    return (
      <Takeaway tone="watch" action={canWrite ? { label: COPY.overview.takeawayOpenJournal, onClick: onReview } : undefined}>
        {COPY.overview.takeawayNotBalanced}
      </Takeaway>
    );
  }
  if (pending > 0) {
    const t = COPY.overview.takeawayPending(pending);
    return (
      <Takeaway tone="watch" action={canWrite ? { label: COPY.overview.takeawayReview, onClick: onReview } : undefined}>
        <strong>{t.count}</strong>{t.rest}
      </Takeaway>
    );
  }
  if (uncategorized > 0) {
    const t = COPY.overview.takeawayUncat(uncategorized);
    return (
      <Takeaway tone="watch" action={canWrite ? { label: COPY.overview.takeawayCategorize, onClick: onCategorize } : undefined}>
        {t.before}<strong>{t.count}</strong>{t.after}
      </Takeaway>
    );
  }
  if (!hasActivity) {
    return <Takeaway tone="neutral">{COPY.overview.takeawayNoActivity}</Takeaway>;
  }
  if (netIncome < 0) {
    const t = COPY.overview.takeawayNegative(formatMoney(netIncome));
    return (
      <Takeaway tone="watch">
        {t.before}<strong>{t.money}</strong>{t.after}
      </Takeaway>
    );
  }
  const t = COPY.overview.takeawayHealthy(formatMoney(netIncome));
  return (
    <Takeaway tone="good">
      {t.before}<strong>{t.money}</strong>{t.after}
    </Takeaway>
  );
}

// ── Accounts — chart of accounts + add ───────────────────────────────────────
function Accounts({
  orgId, canWrite, accounts, entries, onChange,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[];
  entries: JournalEntry[]; onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const balances = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      if (e.status === "pending_review") continue;
      for (const l of e.lines ?? []) {
        m.set(l.account_id, (m.get(l.account_id) ?? 0) + (l.side === "D" ? l.amount_minor : -l.amount_minor));
      }
    }
    return m;
  }, [entries]);

  const live = accounts.filter((a) => !a.is_archived);
  const groups = ACCOUNT_TYPES.map((t) => ({ type: t, rows: live.filter((a) => a.type === t) }))
    .filter((g) => g.rows.length > 0);

  // debit-normal types show net as-is; credit-normal flip sign for display
  const display = (a: LedgerAccount) => {
    const net = balances.get(a.id) ?? 0;
    return a.type === "asset" || a.type === "expense" ? net : -net;
  };

  return (
    <div className="accounts">
      <div className="panel-toolbar">
        <span className="muted">{COPY.accounts.count(live.length)}</span>
        {canWrite && (
          <button className="ghost sm" onClick={() => setAdding((v) => !v)}>
            {adding ? COPY.common.cancel : COPY.accounts.addAccount}
          </button>
        )}
      </div>
      {adding && canWrite && (
        <NewAccountForm orgId={orgId} onDone={(ok) => { setAdding(false); if (ok) onChange(); }} />
      )}
      {live.length === 0 ? (
        <Empty title={COPY.accounts.noAccountsTitle} body={COPY.accounts.noAccountsBody} />
      ) : (
        // PENNY-UX-5 — scrollable region must be keyboard-reachable (axe: scrollable-region-focusable)
        <div className="table-wrap" tabIndex={0} role="region" aria-label={COPY.accounts.tableAria}>
          {groups.map((g) => (
            <div className="coa-group" key={g.type}>
              <div className="coa-type">{COPY.accountTypes[g.type]}</div>
              {g.rows.map((a) => (
                <div className="coa-row" key={a.id}>
                  <span className="coa-code">{a.code ?? COPY.common.emDash}</span>
                  <span className="coa-name">{a.name}</span>
                  <span className="coa-bal">{formatMoney(display(a), a.currency)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewAccountForm({ orgId, onDone }: { orgId: string; onDone: (ok: boolean) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("expense");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      await upsertAccount({ org_id: orgId, name: name.trim(), type, code: code.trim() || null });
      onDone(true);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="ledger-form" onSubmit={submit}>
      <div className="form-row">
        <label>
          <span>{COPY.accounts.codeLabel}</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={COPY.accounts.codePlaceholder} inputMode="numeric" />
        </label>
        <label className="grow">
          <span>{COPY.accounts.nameLabel}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={COPY.accounts.namePlaceholder} required />
        </label>
        <label>
          <span>{COPY.accounts.typeLabel}</span>
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{COPY.accountTypes[t]}</option>)}
          </select>
        </label>
      </div>
      {err && <p className="error sm">{err}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy || !name.trim()}>{busy ? COPY.accounts.adding : COPY.accounts.addAccountSubmit}</button>
      </div>
    </form>
  );
}

// ── Journal — entry browser + new entry + reverse/approve ────────────────────
function Journal({
  orgId, canWrite, accounts, entries, onChange,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[];
  entries: JournalEntry[]; onChange: () => void;
}) {
  const [posting, setPosting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const liveAccounts = accounts.filter((a) => !a.is_archived);

  async function doReverse(e: JournalEntry) {
    setBusyId(e.id); setErr(null);
    try {
      await reverseEntry({ org_id: orgId, entry_id: e.id, idempotency_key: newIdempotencyKey() });
      onChange();
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusyId(null); }
  }
  async function doApprove(e: JournalEntry) {
    setBusyId(e.id); setErr(null);
    try { await approveEntry(orgId, e.id); onChange(); }
    catch (e2) { setErr((e2 as Error).message); } finally { setBusyId(null); }
  }

  return (
    <div className="journal">
      <div className="panel-toolbar">
        <span className="muted">{COPY.journal.count(entries.length)}</span>
        {canWrite && (
          <button className="ghost sm" onClick={() => setPosting((v) => !v)} disabled={liveAccounts.length < 2}>
            {posting ? COPY.common.cancel : COPY.journal.newEntry}
          </button>
        )}
      </div>
      {canWrite && liveAccounts.length < 2 && (
        <p className="muted sm">{COPY.journal.needTwoAccounts}</p>
      )}
      {posting && canWrite && (
        <NewEntryForm
          orgId={orgId} accounts={liveAccounts}
          onDone={(ok) => { setPosting(false); if (ok) onChange(); }}
        />
      )}
      {err && <p className="error sm">{err}</p>}

      {entries.length === 0 ? (
        <Empty title={COPY.journal.noEntriesTitle} body={COPY.journal.noEntriesBody} />
      ) : (
        <ul className="je-list">
          {entries.map((e) => {
            const isOpen = open === e.id;
            const reversal = Boolean(e.reverses_id);
            return (
              <li key={e.id} className={`je${e.status === "reversed" ? " is-reversed" : ""}`}>
                <button className="je-row" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                  <span className="je-date">{e.entry_date}</span>
                  <span className="je-memo">
                    {e.memo ?? (reversal ? COPY.journal.reversalLabel : e.source)}
                    {reversal && <span className="tag">{COPY.journal.reversalTag}</span>}
                  </span>
                  <StatusPill status={e.status} />
                  <span className="je-amt">{formatMoney(entryTotal(e))}</span>
                  <span className="je-caret">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <div className="je-detail">
                    <div className="je-lines">
                      {(e.lines ?? []).map((l) => (
                        <div className="je-line" key={l.id}>
                          <span className="jl-acct">
                            {l.account?.code ? `${l.account.code} · ` : ""}{l.account?.name ?? COPY.common.emDash}
                          </span>
                          <span className={`jl-amt ${l.side === "D" ? "d" : "c"}`} aria-label={l.side === "D" ? COPY.journal.debit : undefined}>
                            {l.side === "D" ? formatMoney(l.amount_minor, l.currency) : ""}
                          </span>
                          <span className={`jl-amt ${l.side === "C" ? "c" : "d"}`} aria-label={l.side === "C" ? COPY.journal.credit : undefined}>
                            {l.side === "C" ? formatMoney(l.amount_minor, l.currency) : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                    {e.source_ref && <p className="muted sm">{COPY.journal.refPrefix}{e.source_ref}</p>}
                    {/* Receipt attached to this transaction (W3.5): view / remove. */}
                    <ReceiptBadge orgId={orgId} entryId={e.id} canWrite={canWrite} />
                    {canWrite && (
                      <div className="je-actions">
                        {e.status === "pending_review" && (
                          <button className="ghost sm" disabled={busyId === e.id} onClick={() => doApprove(e)}>
                            {COPY.journal.approve}
                          </button>
                        )}
                        {e.status === "posted" && (
                          <button className="ghost sm danger" disabled={busyId === e.id} onClick={() => doReverse(e)}>
                            {busyId === e.id ? COPY.journal.reversing : COPY.journal.reverse}
                          </button>
                        )}
                      </div>
                    )}
                    {/* Collaboration primitives (card W1.5): flag / note / suggest a
                        category change. Only on posted entries; server role-gates. */}
                    {canWrite && e.status === "posted" && (
                      <EntryCollab
                        orgId={orgId} entryId={e.id} accounts={accounts}
                        fromAccountIds={Array.from(new Set((e.lines ?? [])
                          .map((l) => l.account_id).filter((x): x is string => Boolean(x))))}
                        onChange={onChange}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NewEntryForm({
  orgId, accounts, onDone,
}: {
  orgId: string; accounts: LedgerAccount[]; onDone: (ok: boolean) => void;
}) {
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { account_id: accounts[0]?.id ?? "", side: "D", amount: "", memo: "" },
    { account_id: accounts[1]?.id ?? accounts[0]?.id ?? "", side: "C", amount: "", memo: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parsed = lines.map((l) => parseMoneyToMinor(l.amount) ?? 0);
  const debit = lines.reduce((s, l, i) => s + (l.side === "D" ? parsed[i] : 0), 0);
  const credit = lines.reduce((s, l, i) => s + (l.side === "C" ? parsed[i] : 0), 0);
  const balanced = debit === credit && debit > 0;
  const allValid = lines.every((l, i) => l.account_id && parsed[i] > 0);

  function update(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  const addLine = () =>
    setLines((ls) => [...ls, { account_id: accounts[0]?.id ?? "", side: "D", amount: "", memo: "" }]);
  const removeLine = (i: number) => setLines((ls) => (ls.length > 2 ? ls.filter((_, j) => j !== i) : ls));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!balanced || !allValid) return;
    setBusy(true); setErr(null);
    try {
      await postEntry({
        org_id: orgId,
        entry_date: date,
        idempotency_key: newIdempotencyKey(),
        memo: memo.trim() || null,
        lines: lines.map((l, i) => ({
          account_id: l.account_id, amount_minor: parsed[i], side: l.side, memo: l.memo.trim() || null,
        })),
      });
      onDone(true);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ledger-form entry-form" onSubmit={submit}>
      <div className="form-row">
        <label>
          <span>{COPY.journal.dateLabel}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="grow">
          <span>{COPY.journal.memoLabel}</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={COPY.journal.memoPlaceholder} />
        </label>
      </div>

      <div className="lines-head">
        <span>{COPY.journal.colAccount}</span><span>{COPY.journal.colDrCr}</span><span>{COPY.journal.colAmount}</span><span />
      </div>
      {lines.map((l, i) => (
        <div className="line-row" key={i}>
          <select value={l.account_id} onChange={(e) => update(i, { account_id: e.target.value })} aria-label={COPY.journal.lineAccountAria(i + 1)}>
            <option value="">{COPY.common.selectAccount}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>
            ))}
          </select>
          <select value={l.side} onChange={(e) => update(i, { side: e.target.value as "D" | "C" })} aria-label={COPY.journal.lineDrCrAria(i + 1)}>
            <option value="D">{COPY.journal.debit}</option>
            <option value="C">{COPY.journal.credit}</option>
          </select>
          <input
            inputMode="decimal" value={l.amount} aria-label={COPY.journal.lineAmountAria(i + 1)}
            onChange={(e) => update(i, { amount: e.target.value })} placeholder={COPY.journal.amountPlaceholder}
          />
          <button type="button" className="line-del" onClick={() => removeLine(i)}
            disabled={lines.length <= 2} aria-label={COPY.journal.removeLineAria(i + 1)}>×</button>
        </div>
      ))}

      <div className="entry-foot">
        <button type="button" className="ghost sm" onClick={addLine}>{COPY.journal.addLine}</button>
        <span className={`balance-indicator ${balanced ? "ok" : "off"}`}>
          {COPY.journal.balanceIndicator(formatMoney(debit), formatMoney(credit), balanced)}
        </span>
      </div>
      {err && <p className="error sm">{err}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy || !balanced || !allValid}>
          {busy ? COPY.journal.posting : COPY.journal.postEntry}
        </button>
      </div>
    </form>
  );
}

// ── Reports — trial balance / P&L / balance sheet / GL detail + exports ──────
// The date range is applied to the derived report (rangeFilter, shared with the
// export module so screen ≡ file). Entries arrive fully paginated (api.ts), so a
// 10k-entry org reports + exports COMPLETELY — no 1000-row truncation.
function Reports({ entries, org }: { entries: JournalEntry[]; org: { id: string; name: string } }) {
  const [view, setView] = useState<ReportKind>("pnl");
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [necYear, setNecYear] = useState<number>(new Date().getFullYear() - 1);
  const scope: ReportScope = { start: start || undefined, end: end || undefined };
  const filter = useMemo(() => rangeFilter(scope), [start, end]);

  // 1099-NEC summary (card W2.5) — server-computed vendor roll-up for the tax year.
  const necRows = useNecSummary(org.id, necYear).data ?? [];
  const nec = useMemo(() => necSummary(necYear, necRows), [necYear, necRows]);

  const [busy, setBusy] = useState<null | "csv" | "pdf">(null);
  const [err, setErr] = useState<string | null>(null);
  // W4.4 lender package: optionally include a prior-period comparative column.
  const [pkgCompare, setPkgCompare] = useState(true);
  const priorScope = useMemo(
    () => (view === "pkg" && pkgCompare ? priorPeriodScope(scope) : undefined),
    [view, pkgCompare, start, end],
  );

  async function download(format: "csv" | "pdf") {
    setBusy(format); setErr(null);
    try {
      const ctx: ExportContext = {
        orgName: org.name,
        scope: view === "nec" ? { end: `${necYear}-12-31` } : scope,
        generatedOn: today(),
        nec: view === "nec" ? nec : undefined,
        priorScope: view === "pkg" ? priorScope : undefined,
      };
      const rows = view === "nec" ? nec.rows.length : entries.length;
      // Build + download client-side first (the user gets their file even if the
      // audit call later fails); then record the export. Fire-and-forget audit.
      const filename = downloadReport(view, format, entries, ctx);
      void logReportExport({
        org_id: org.id, report: view, format,
        scope: { start: scope.start ?? null, end: scope.end ?? null },
        filename, rows,
      }).catch(() => { /* audit best-effort; download already delivered */ });
    } catch {
      setErr(COPY.reports.exportError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="reports">
      <div className="seg report-seg">
        <button className={view === "pnl" ? "on" : ""} onClick={() => setView("pnl")}>{COPY.reports.pnl}</button>
        <button className={view === "tb" ? "on" : ""} onClick={() => setView("tb")}>{COPY.reports.trialBalance}</button>
        <button className={view === "bs" ? "on" : ""} onClick={() => setView("bs")}>{COPY.reports.balanceSheet}</button>
        <button className={view === "cf" ? "on" : ""} onClick={() => setView("cf")}>{COPY.reports.cashFlow}</button>
        <button className={view === "gl" ? "on" : ""} onClick={() => setView("gl")}>{COPY.reports.generalLedger}</button>
        <button className={view === "nec" ? "on" : ""} onClick={() => setView("nec")}>{COPY.reports.nec}</button>
        <button className={view === "pkg" ? "on" : ""} onClick={() => setView("pkg")}>{COPY.reports.pkg}</button>
      </div>

      <div className="report-controls" role="group" aria-label={COPY.reports.exportScopeAria}>
        {view === "nec" ? (
          <label className="report-date">
            <span>{COPY.reports.necTaxYear}</span>
            <input
              type="number" min={2000} max={2100} value={necYear}
              onChange={(e) => setNecYear(Number(e.target.value) || necYear)}
            />
          </label>
        ) : (
          <>
            <label className="report-date">
              <span>{view === "bs" ? COPY.reports.exportAsOf : COPY.reports.exportFrom}</span>
              {view === "bs" ? (
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              ) : (
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              )}
            </label>
            {view !== "bs" && (
              <label className="report-date">
                <span>{COPY.reports.exportTo}</span>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            )}
          </>
        )}
        {view === "pkg" && (
          <label className="report-date pkg-compare">
            <input
              type="checkbox" checked={pkgCompare}
              onChange={(e) => setPkgCompare(e.target.checked)}
            />
            <span>{COPY.reports.pkgComparePrior}</span>
          </label>
        )}
        <span className="report-dl">
          <button className="ghost sm" disabled={busy !== null} onClick={() => download("csv")}>
            {busy === "csv" ? COPY.reports.exporting : COPY.reports.downloadCsv}
          </button>
          <button className="ghost sm" disabled={busy !== null} onClick={() => download("pdf")}>
            {busy === "pdf" ? COPY.reports.exporting : COPY.reports.downloadPdf}
          </button>
        </span>
      </div>
      {err && <p className="error sm">{err}</p>}

      {view === "pnl" && <PnlReport entries={entries} filter={filter} />}
      {view === "tb" && <TrialBalanceReport entries={entries} filter={filter} />}
      {view === "bs" && <BalanceSheetReport entries={entries} asOf={scope.end} />}
      {view === "cf" && <CashFlowReport entries={entries} scope={scope} />}
      {view === "gl" && <GeneralLedgerReport entries={entries} filter={filter} />}
      {view === "nec" && <NecReport nec={nec} />}
      {view === "pkg" && <PackageReport entries={entries} scope={scope} priorScope={priorScope} />}
    </div>
  );
}

/**
 * The prior comparative period: the same-length window immediately BEFORE the
 * selected period. If no start is set (open-ended), we can't infer a length, so
 * there is no comparative (the package still assembles single-period).
 */
function priorPeriodScope(scope: ReportScope): ReportScope | undefined {
  const { start, end } = scope;
  if (!start || !end) return undefined;
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  const priorEnd = new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000);
  const priorStart = new Date(priorEnd.getTime() - days * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(priorStart), end: iso(priorEnd) };
}

// ── Lender / due-diligence package (card W4.4) ───────────────────────────────
// On-screen summary of what the package export contains. The heavy lifting is in
// the export module (packageModel), which assembles the SAME derived statements
// into one CSV/PDF — this panel just previews the tie-out + headline figures so
// the user knows the package is sound before they hand it to a lender.
function PackageReport(
  { entries, scope, priorScope }: { entries: JournalEntry[]; scope: ReportScope; priorScope?: ReportScope },
) {
  const summary = useMemo(() => {
    const bs = balanceSheet(entries, scope.end);
    const cf = cashFlow(entries, scope);
    const pnl = profitAndLoss(entries, rangeFilter(scope));
    const ar = arApAging(entries, "ar", scope.end);
    const ap = arApAging(entries, "ap", scope.end);
    return { bs, cf, pnl, ar, ap };
  }, [entries, scope.start, scope.end]);

  if (entries.length === 0) {
    return <Empty title={COPY.reports.pkgTitle} body={COPY.reports.pkgBody} />;
  }
  const ties = summary.bs.balanced && summary.cf.ties;
  return (
    <div className="report package-report">
      <p className="sub">{COPY.reports.pkgBody}</p>
      <p className="sub sm">{COPY.reports.pkgIncludes}</p>
      <p className={`sub sm ${ties ? "" : "error"}`}>
        {ties ? COPY.reports.cfTiesNote : COPY.reports.cfDoesNotTie}
      </p>
      <table className="report-table">
        <tbody>
          <tr><td>{COPY.reports.cfNetIncome}</td><td className="num">{formatMoney(summary.pnl.netIncome)}</td></tr>
          <tr><td>{COPY.reports.cfEndingCash}</td><td className="num">{formatMoney(summary.cf.endingCash)}</td></tr>
          <tr><td>{COPY.reports.pkgArAging}</td><td className="num">{formatMoney(summary.ar.grandTotal)}</td></tr>
          <tr><td>{COPY.reports.pkgApAging}</td><td className="num">{formatMoney(summary.ap.grandTotal)}</td></tr>
          {priorScope && (
            <tr><td>{COPY.reports.pkgComparePrior}</td><td className="num">{priorScope.start} – {priorScope.end}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── 1099-NEC contractor summary (card W2.5) ──────────────────────────────────
function NecReport({ nec }: { nec: ReturnType<typeof necSummary> }) {
  if (nec.rows.length === 0) {
    return <Empty title={COPY.reports.necEmptyTitle} body={COPY.reports.necEmptyBody} />;
  }
  return (
    <div className="report">
      <p className="sub sm">{COPY.reports.necThresholdNote}</p>
      <table className="report-table">
        <thead>
          <tr>
            <th>{COPY.reports.necColVendor}</th>
            <th>{COPY.reports.necColW9}</th>
            <th>{COPY.reports.necColTin}</th>
            <th className="num">{COPY.reports.necColReportable}</th>
            <th className="num">{COPY.reports.necColExcluded}</th>
            <th>{COPY.reports.necColMustFile}</th>
          </tr>
        </thead>
        <tbody>
          {nec.rows.map((r) => (
            <tr key={r.vendor_id} className={r.meets_threshold ? "t-must-file" : ""}>
              <td>{r.vendor_name}</td>
              <td>{r.w9_on_file ? COPY.reports.necW9OnFile : COPY.reports.necW9Missing}</td>
              <td>{r.tax_id_last4 ? `${(r.tax_id_type ?? "").toUpperCase()} ••${r.tax_id_last4}` : "—"}</td>
              <td className="num">{formatMoney(r.reportable_minor)}</td>
              <td className="num">{formatMoney(r.excluded_minor)}</td>
              <td>{r.meets_threshold ? COPY.reports.necMustFileYes : COPY.reports.necMustFileNo}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>{COPY.reports.necTotalToFile} ({nec.vendorsToFile})</td>
            <td className="num">{formatMoney(nec.totalReportable)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

type DateFilter = ((d: string) => boolean) | undefined;

function PnlReport({ entries, filter }: { entries: JournalEntry[]; filter?: DateFilter }) {
  const p = useMemo(() => profitAndLoss(entries, filter), [entries, filter]);
  if (p.income.length === 0 && p.expense.length === 0) {
    return <Empty title={COPY.reports.pnlEmptyTitle} body={COPY.reports.pnlEmptyBody} />;
  }
  return (
    <div className="report">
      <ReportSection title={COPY.reports.revenue} rows={p.income.map((r) => ({ label: r.name, value: formatMoney(r.amount) }))}
        total={{ label: COPY.reports.totalRevenue, value: formatMoney(p.totalIncome) }} />
      <ReportSection title={COPY.reports.expenses} rows={p.expense.map((r) => ({ label: r.name, value: `(${formatMoney(r.amount)})` }))}
        total={{ label: COPY.reports.totalExpenses, value: `(${formatMoney(p.totalExpense)})` }} />
      <div className="report-net">
        <span>{COPY.reports.netIncome}</span>
        <span className={p.netIncome >= 0 ? "t-good" : "t-bad"}>
          {p.netIncome >= 0 ? formatMoney(p.netIncome) : `(${formatMoney(-p.netIncome)})`}
        </span>
      </div>
    </div>
  );
}

function TrialBalanceReport({ entries, filter }: { entries: JournalEntry[]; filter?: DateFilter }) {
  const tb = useMemo(
    () => trialBalance(filter ? entries.filter((e) => filter(e.entry_date)) : entries),
    [entries, filter],
  );
  if (tb.rows.length === 0) return <Empty title={COPY.reports.tbEmptyTitle} body={COPY.reports.tbEmptyBody} />;
  return (
    <div className="report">
      <div className="report-table tb">
        <div className="report-head"><span>{COPY.reports.colAccount}</span><span>{COPY.reports.colDebit}</span><span>{COPY.reports.colCredit}</span></div>
        {tb.rows.map((r) => (
          <div className="report-row" key={r.account_id}>
            <span className="r-name">{r.code ? `${r.code} · ` : ""}{r.name}</span>
            <span className="r-num">{r.net >= 0 ? formatMoney(r.net) : ""}</span>
            <span className="r-num">{r.net < 0 ? formatMoney(-r.net) : ""}</span>
          </div>
        ))}
        <div className="report-row totals">
          <span>{COPY.reports.totals}</span>
          <span className="r-num">{formatMoney(tb.totalDebit)}</span>
          <span className="r-num">{formatMoney(tb.totalCredit)}</span>
        </div>
      </div>
      {!tb.balanced && <p className="error sm">{COPY.reports.tbDoesNotTie}</p>}
    </div>
  );
}

function BalanceSheetReport({ entries, asOf }: { entries: JournalEntry[]; asOf?: string }) {
  const bs = useMemo(() => balanceSheet(entries, asOf), [entries, asOf]);
  const empty = bs.assets.length === 0 && bs.liabilities.length === 0 && bs.equity.length === 0;
  if (empty && bs.currentEarnings === 0) {
    return <Empty title={COPY.reports.bsEmptyTitle} body={COPY.reports.bsEmptyBody} />;
  }
  return (
    <div className="report">
      <ReportSection title={COPY.reports.assets} rows={bs.assets.map((r) => ({ label: r.name, value: formatMoney(r.amount) }))}
        total={{ label: COPY.reports.totalAssets, value: formatMoney(bs.totalAssets) }} />
      <ReportSection title={COPY.reports.liabilities} rows={bs.liabilities.map((r) => ({ label: r.name, value: formatMoney(r.amount) }))}
        total={{ label: COPY.reports.totalLiabilities, value: formatMoney(bs.totalLiabilities) }} />
      <ReportSection
        title={COPY.reports.equity}
        rows={[
          ...bs.equity.map((r) => ({ label: r.name, value: formatMoney(r.amount) })),
          { label: COPY.reports.currentEarnings, value: formatMoney(bs.currentEarnings) },
        ]}
        total={{ label: COPY.reports.totalEquity, value: formatMoney(bs.totalEquity + bs.currentEarnings) }}
      />
      <div className="report-net">
        <span>{COPY.reports.accountingEquation}</span>
        <span className={bs.balanced ? "t-good" : "t-bad"}>{bs.balanced ? COPY.reports.balanced : COPY.reports.outOfBalance}</span>
      </div>
    </div>
  );
}

// Cash-flow statement (GAAP indirect, card W4.2). Shares the cashFlow() pure
// function with the export so screen ≡ file to the cent; the statement ties to
// the balance-sheet cash change by construction (see reports.ts).
function CashFlowReport({ entries, scope }: { entries: JournalEntry[]; scope: ReportScope }) {
  const cf = useMemo(() => cashFlow(entries, scope), [entries, scope.start, scope.end]);
  const empty = cf.netChange === 0 && cf.operatingAdjustments.length === 0
    && cf.investing.length === 0 && cf.financing.length === 0 && cf.netIncome === 0;
  if (empty) return <Empty title={COPY.reports.cfEmptyTitle} body={COPY.reports.cfEmptyBody} />;
  const sign = (v: number) => (v >= 0 ? formatMoney(v) : `(${formatMoney(-v)})`);
  return (
    <div className="report">
      <ReportSection
        title={COPY.reports.cfOperating}
        rows={[
          { label: COPY.reports.cfNetIncome, value: sign(cf.netIncome) },
          ...cf.operatingAdjustments.map((l) => ({ label: l.name, value: sign(l.amount) })),
        ]}
        total={{ label: COPY.reports.cfOperatingTotal, value: sign(cf.operating) }}
      />
      <ReportSection
        title={COPY.reports.cfInvesting}
        rows={cf.investing.map((l) => ({ label: l.name, value: sign(l.amount) }))}
        total={{ label: COPY.reports.cfInvestingTotal, value: sign(cf.investingTotal) }}
      />
      <ReportSection
        title={COPY.reports.cfFinancing}
        rows={cf.financing.map((l) => ({ label: l.name, value: sign(l.amount) }))}
        total={{ label: COPY.reports.cfFinancingTotal, value: sign(cf.financingTotal) }}
      />
      <ReportSection
        title={COPY.reports.cfNetChange}
        rows={[
          { label: COPY.reports.cfNetChange, value: sign(cf.netChange) },
          { label: COPY.reports.cfBeginningCash, value: sign(cf.beginningCash) },
        ]}
        total={{ label: COPY.reports.cfEndingCash, value: sign(cf.endingCash) }}
      />
      <div className="report-net">
        <span>{cf.ties ? COPY.reports.cfTiesNote : COPY.reports.cfDoesNotTie}</span>
        <span className={cf.ties ? "t-good" : "t-bad"}>
          {cf.ties ? COPY.reports.balanced : COPY.reports.outOfBalance}
        </span>
      </div>
    </div>
  );
}

// GL detail — full entry/line dump with per-account running balances. Shares the
// generalLedger() pure function with the export so screen ≡ file to the cent.
function GeneralLedgerReport({ entries, filter }: { entries: JournalEntry[]; filter?: DateFilter }) {
  const rows = useMemo(() => generalLedger(entries, filter), [entries, filter]);
  if (rows.length === 0) return <Empty title={COPY.reports.glEmptyTitle} body={COPY.reports.glEmptyBody} />;
  return (
    <div className="report">
      {/* PENNY-UX-5 — the widest report; keyboard users must be able to focus + arrow-scroll it (F5) */}
      <div className="table-wrap" tabIndex={0} role="region" aria-label={COPY.reports.glTableAria}>
        <div className="report-table gl">
          <div className="report-head gl-head">
            <span>{COPY.reports.glColDate}</span>
            <span>{COPY.reports.glColAccount}</span>
            <span>{COPY.reports.glColMemo}</span>
            <span>{COPY.reports.glColDebit}</span>
            <span>{COPY.reports.glColCredit}</span>
            <span>{COPY.reports.glColBalance}</span>
          </div>
          {rows.map((r, i) => (
            <div className="report-row gl-row" key={`${r.account_id}-${i}`}>
              <span className="gl-date">{r.entry_date}</span>
              <span className="gl-acct">{r.account}</span>
              <span className="gl-memo">{r.memo}</span>
              <span className="r-num">{r.debit ? formatMoney(r.debit) : ""}</span>
              <span className="r-num">{r.credit ? formatMoney(r.credit) : ""}</span>
              <span className="r-num">{formatMoney(r.balance)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportSection({
  title, rows, total,
}: {
  title: string;
  rows: { label: string; value: string }[];
  total: { label: string; value: string };
}) {
  return (
    <div className="report-section">
      <div className="report-section-h">{title}</div>
      {rows.length === 0 ? (
        <div className="report-row"><span className="muted">{COPY.common.none}</span><span /></div>
      ) : (
        rows.map((r, i) => (
          <div className="report-row" key={i}><span className="r-name">{r.label}</span><span className="r-num">{r.value}</span></div>
        ))
      )}
      <div className="report-row subtotal"><span>{total.label}</span><span className="r-num">{total.value}</span></div>
    </div>
  );
}

// ── Periods — close / reopen ─────────────────────────────────────────────────
function Periods({
  orgId, canWrite, periods, onChange,
}: {
  orgId: string; canWrite: boolean; periods: AccountingPeriod[]; onChange: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(p: AccountingPeriod) {
    setBusyId(p.id); setErr(null);
    try {
      await setPeriod(orgId, p.id, p.status === "open" ? "close" : "reopen");
      onChange();
    } catch (e) { setErr((e as Error).message); } finally { setBusyId(null); }
  }

  if (periods.length === 0) {
    return <Empty title={COPY.periods.noPeriodsTitle} body={COPY.periods.noPeriodsBody} />;
  }
  return (
    <div className="periods">
      {err && <p className="error sm">{err}</p>}
      {/* PENNY-UX-5 — scrollable region must be keyboard-reachable (axe: scrollable-region-focusable) */}
      <div className="table-wrap" tabIndex={0} role="region" aria-label={COPY.periods.tableAria}>
        {periods.map((p) => (
          <div className="period-row" key={p.id}>
            <span className="p-range">{p.period_start} → {p.period_end}</span>
            <span className={`status-pill s-${p.status}`}>{p.status}</span>
            {canWrite && (
              <button className="ghost sm" disabled={busyId === p.id} onClick={() => toggle(p)}>
                {p.status === "open" ? COPY.periods.close : COPY.periods.reopen}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: JournalEntry["status"] }) {
  return <span className={`status-pill s-${status}`}>{status.replace("_", " ")}</span>;
}
function Empty({ title, body, action }: {
  title: string; body: string; action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="ledger-empty">
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      {action && <button className="ghost sm" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
