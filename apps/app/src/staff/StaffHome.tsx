/**
 * Platform-staff console (ARCHITECTURE.md §4.2, §11). A third lens, strictly
 * separate from any tenant role: a directory of every organization, and — only
 * behind an explicit, time-boxed, audited break-glass window — a READ-ONLY view
 * of a tenant's books. Runs in PARALLEL with the existing /admin during the
 * migration; it adds the cross-tenant capability /admin never had, and removes
 * nothing. Penny brand; responsive; the database enforces every gate.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import AccountMenu from "../components/AccountMenu";
import { SITE } from "@ff/site";
import { COPY } from "../copy";
import {
  useStaffOrgs, useStaffBreakGlass, useStaffAccounts, useStaffEntries,
  useOpenBreakGlass, useCloseBreakGlass, useStaffRefresh,
  type StaffOrg, type BreakGlassWindow,
} from "./api";
import { balanceSheet, profitAndLoss, trialBalance } from "../ledger/reports";
import { Takeaway } from "../ledger/Takeaway";
import { formatMoney, formatMoneyShort } from "../ledger/money";
import type { JournalEntry } from "../ledger/types";

export default function StaffHome({ isStaff }: { isStaff: boolean }) {
  const { session, signOut } = useAuth();
  const orgs = useStaffOrgs(isStaff);
  const windows = useStaffBreakGlass(isStaff);
  const [selected, setSelected] = useState<StaffOrg | null>(null);

  if (!isStaff) {
    return (
      <div className="shell">
        <StaffBar email={session?.user.email} signOut={signOut} />
        <main className="workspace">
          <div className="ledger-empty">
            <h3>{COPY.console.denied.title}</h3>
            <p className="muted">{COPY.console.denied.body}</p>
            <Link className="ghost" to="/">{COPY.console.denied.back}</Link>
          </div>
        </main>
      </div>
    );
  }

  const activeWindow = (org: StaffOrg | null) =>
    org ? (windows.data ?? []).find((w) => w.org_id === org.id && w.active) ?? null : null;

  return (
    <div className="shell">
      <StaffBar email={session?.user.email} signOut={signOut} />
      <main className="workspace">
        <section className="lens staff">
          <header className="ledger-head">
            <p className="eyebrow lens-eyebrow">{SITE.company}</p>
            <h1 className="page-title">{COPY.staff.title}</h1>
            <span className="readonly-chip staff-chip">{COPY.staff.chip}</span>
          </header>

          {selected ? (
            <OrgDetail
              org={selected}
              window={activeWindow(selected)}
              onBack={() => setSelected(null)}
            />
          ) : (
            <Directory
              orgs={orgs.data ?? []}
              loading={orgs.isLoading}
              error={orgs.isError}
              windows={windows.data ?? []}
              onOpen={setSelected}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function StaffBar({ email, signOut }: { email?: string; signOut: () => Promise<void> | void }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/" title={COPY.nav.brandTitle(SITE.company)}>
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
          {COPY.nav.penny}
        </Link>
        <span className="role-pill role-staff">{COPY.console.roleStaff}</span>
        <span className="spacer" />
        <AccountMenu email={email}>
          <div className="acct-sep" />
          <Link className="acct-item" role="menuitem" to="/">{COPY.console.backToPenny}</Link>
          <div className="acct-sep" />
          <button className="acct-item acct-signout" role="menuitem" onClick={() => void signOut()}>
            {COPY.nav.signOut}
          </button>
        </AccountMenu>
      </div>
    </header>
  );
}

// ── directory of all organizations ───────────────────────────────────────────
function Directory({
  orgs, loading, error, windows, onOpen,
}: {
  orgs: StaffOrg[]; loading: boolean; error: boolean;
  windows: BreakGlassWindow[]; onOpen: (o: StaffOrg) => void;
}) {
  const [q, setQ] = useState("");
  const activeByOrg = useMemo(() => {
    const m = new Map<string, BreakGlassWindow>();
    for (const w of windows) if (w.active) m.set(w.org_id, w);
    return m;
  }, [windows]);

  if (loading) return <p className="muted">{COPY.staff.directory.loading}</p>;
  if (error) return <p className="error">{COPY.staff.directory.error}</p>;

  const filtered = q.trim()
    ? orgs.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()))
    : orgs;

  return (
    <div className="staff-directory">
      <p className="muted sm staff-lead">
        {COPY.staff.directory.lead}
      </p>
      <div className="panel-toolbar">
        <span className="muted">{COPY.staff.directory.count(orgs.length)}</span>
        <input
          className="staff-search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={COPY.staff.directory.searchPlaceholder} aria-label={COPY.staff.directory.searchAria}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="ledger-empty"><h3>{COPY.staff.directory.empty}</h3><p className="muted">{COPY.staff.directory.emptyBody}</p></div>
      ) : (
        <ul className="staff-org-list">
          {filtered.map((o) => {
            const w = activeByOrg.get(o.id);
            return (
              <li key={o.id} className="staff-org-row">
                <button className="staff-org-main" onClick={() => onOpen(o)}>
                  <span className="so-name">{o.name}</span>
                  <span className="so-meta">{COPY.staff.directory.orgMeta(o.type, o.entry_count)}</span>
                </button>
                {w && <span className="status-pill s-posted">{COPY.staff.directory.breakGlassOpen}</span>}
                <button className="ghost sm" onClick={() => onOpen(o)}>{COPY.staff.directory.open}</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── one org: break-glass console + read-only books ──────────────────────────
function OrgDetail({
  org, window: win, onBack,
}: {
  org: StaffOrg; window: BreakGlassWindow | null; onBack: () => void;
}) {
  const accounts = useStaffAccounts(org.id, Boolean(win));
  const entriesQ = useStaffEntries(org.id, Boolean(win));

  return (
    <div className="staff-detail">
      <div className="panel-toolbar">
        <button className="ghost sm" onClick={onBack}>{COPY.staff.detail.back}</button>
        <span className="muted">{org.name} · {org.type}</span>
      </div>

      {win ? (
        <ActiveWindowBanner win={win} />
      ) : (
        <OpenForm org={org} />
      )}

      {win && (
        <ReadOnlyBooks
          loading={accounts.isLoading || entriesQ.isLoading}
          error={accounts.isError || entriesQ.isError}
          entries={entriesQ.data ?? []}
          accountCount={(accounts.data ?? []).length}
        />
      )}
    </div>
  );
}

function ActiveWindowBanner({ win }: { win: BreakGlassWindow }) {
  const close = useCloseBreakGlass();
  const refresh = useStaffRefresh();
  const minsLeft = Math.max(0, Math.round((new Date(win.expires_at).getTime() - Date.now()) / 60000));
  return (
    <div className="break-glass-banner">
      <div className="bg-text">
        <strong>{COPY.staff.banner.active}</strong> — {win.reason}
        <span className="muted">{COPY.staff.banner.expires(minsLeft)}</span>
      </div>
      <button
        className="ghost sm danger"
        disabled={close.isPending}
        onClick={async () => { await close.mutateAsync(win.id); refresh(); }}
      >
        {close.isPending ? COPY.staff.banner.closing : COPY.staff.banner.closeNow}
      </button>
    </div>
  );
}

function OpenForm({ org }: { org: StaffOrg }) {
  const open = useOpenBreakGlass();
  const refresh = useStaffRefresh();
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(60);

  return (
    <div className="break-glass-open">
      <h3 className="section-h">{COPY.staff.openForm.heading}</h3>
      <p className="muted sm">
        {COPY.staff.openForm.body(org.name)}
      </p>
      <form
        className="ledger-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reason.trim()) return;
          await open.mutateAsync({ orgId: org.id, reason: reason.trim(), minutes });
          refresh();
        }}
      >
        <div className="form-row">
          <label className="grow">
            <span>{COPY.staff.openForm.reasonLabel}</span>
            <input
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={COPY.staff.openForm.reasonPlaceholder} required
            />
          </label>
          <label>
            <span>{COPY.staff.openForm.windowLabel}</span>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              <option value={15}>{COPY.staff.openForm.window15}</option>
              <option value={60}>{COPY.staff.openForm.window60}</option>
              <option value={240}>{COPY.staff.openForm.window240}</option>
            </select>
          </label>
        </div>
        {open.isError && <p className="error sm">{(open.error as Error).message}</p>}
        <div className="form-actions">
          <button type="submit" disabled={open.isPending || !reason.trim()}>
            {open.isPending ? COPY.staff.openForm.opening : COPY.staff.openForm.submit}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReadOnlyBooks({
  loading, error, entries, accountCount,
}: {
  loading: boolean; error: boolean; entries: JournalEntry[]; accountCount: number;
}) {
  const pnl = useMemo(() => profitAndLoss(entries), [entries]);
  const bs = useMemo(() => balanceSheet(entries), [entries]);
  const tb = useMemo(() => trialBalance(entries), [entries]);
  const recent = entries.slice(0, 8);

  if (loading) return <p className="muted">{COPY.staff.books.loading}</p>;
  if (error) return <p className="error">{COPY.staff.books.error}</p>;

  const summary = COPY.staff.books.summary(formatMoney(pnl.netIncome), entries.length);

  return (
    <div className="staff-books">
      {tb.balanced ? (
        <Takeaway tone="neutral">
          {summary.before}<strong>{summary.netIncome}</strong>{summary.mid}<strong>{summary.count}</strong>{summary.after}
        </Takeaway>
      ) : (
        <Takeaway tone="watch">{COPY.staff.books.unbalanced}</Takeaway>
      )}
      <div className="kpis">
        <Kpi label={COPY.staff.books.kpiAccounts} value={String(accountCount)} />
        <Kpi label={COPY.staff.books.kpiEntries} value={String(entries.length)} />
        <Kpi label={COPY.staff.books.kpiCash} value={formatMoneyShort(bs.totalAssets)} />
        <Kpi label={COPY.staff.books.kpiNetIncome} value={formatMoneyShort(pnl.netIncome)} tone={pnl.netIncome >= 0 ? "good" : "bad"} />
      </div>
      {!tb.balanced && (
        <p className="warn-banner">{COPY.staff.books.unbalancedBanner(formatMoney(tb.totalDebit), formatMoney(tb.totalCredit))}</p>
      )}
      <h3 className="section-h">{COPY.staff.books.activityHeading}</h3>
      {recent.length === 0 ? (
        <p className="muted">{COPY.staff.books.activityEmpty}</p>
      ) : (
        <ul className="activity">
          {recent.map((e) => (
            <li key={e.id}>
              <span className="a-date">{e.entry_date}</span>
              <span className="a-memo">{e.memo ?? e.source}</span>
              <span className={`status-pill s-${e.status}`}>{e.status.replace("_", " ")}</span>
              <span className="a-amt">
                {formatMoney((e.lines ?? []).filter((l) => l.side === "D").reduce((s, l) => s + l.amount_minor, 0))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value${tone ? ` t-${tone}` : ""}`}>{value}</span>
    </div>
  );
}
