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
import { SITE } from "@ff/site";
import {
  useStaffOrgs, useStaffBreakGlass, useStaffAccounts, useStaffEntries,
  useOpenBreakGlass, useCloseBreakGlass, useStaffRefresh,
  type StaffOrg, type BreakGlassWindow,
} from "./api";
import { balanceSheet, profitAndLoss, trialBalance } from "../ledger/reports";
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
            <h3>Staff only</h3>
            <p className="muted">This console is for FounderFirst platform staff.</p>
            <Link className="ghost" to="/">← Back to Penny</Link>
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
            <h1>Platform console</h1>
            <span className="readonly-chip staff-chip">Staff · break-glass audited</span>
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
        <span className="brand" title={`Penny by ${SITE.company}`}>
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
          Penny
        </span>
        <span className="role-pill role-staff">Platform staff</span>
        <span className="spacer" />
        <Link className="ghost sm" to="/">Back to Penny</Link>
        <span className="muted topbar-email">{email}</span>
        <button className="ghost" onClick={() => void signOut()}>Sign out</button>
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

  if (loading) return <p className="muted">Loading organizations…</p>;
  if (error) return <p className="error">Couldn't load the directory.</p>;

  const filtered = q.trim()
    ? orgs.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()))
    : orgs;

  return (
    <div className="staff-directory">
      <div className="panel-toolbar">
        <span className="muted">{orgs.length} organizations</span>
        <input
          className="staff-search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search organizations…" aria-label="Search organizations"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="ledger-empty"><h3>No organizations</h3><p className="muted">Nothing matches.</p></div>
      ) : (
        <ul className="staff-org-list">
          {filtered.map((o) => {
            const w = activeByOrg.get(o.id);
            return (
              <li key={o.id} className="staff-org-row">
                <button className="staff-org-main" onClick={() => onOpen(o)}>
                  <span className="so-name">{o.name}</span>
                  <span className="so-meta">{o.type} · {o.entry_count} entries</span>
                </button>
                {w && <span className="status-pill s-posted">break-glass open</span>}
                <button className="ghost sm" onClick={() => onOpen(o)}>Open →</button>
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
        <button className="ghost sm" onClick={onBack}>← All organizations</button>
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
        <strong>Break-glass active</strong> — {win.reason}
        <span className="muted"> · expires in ~{minsLeft} min · this access is logged</span>
      </div>
      <button
        className="ghost sm danger"
        disabled={close.isPending}
        onClick={async () => { await close.mutateAsync(win.id); refresh(); }}
      >
        {close.isPending ? "Closing…" : "Close now"}
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
      <h3 className="section-h">View this organization's books</h3>
      <p className="muted sm">
        Access to a tenant's books is break-glass: time-boxed and recorded to the audit log.
        Give a reason and open a window to view {org.name}'s books read-only.
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
            <span>Reason</span>
            <input
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. investigating support ticket #1234" required
            />
          </label>
          <label>
            <span>Window</span>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              <option value={15}>15 min</option>
              <option value={60}>60 min</option>
              <option value={240}>4 hours</option>
            </select>
          </label>
        </div>
        {open.isError && <p className="error sm">{(open.error as Error).message}</p>}
        <div className="form-actions">
          <button type="submit" disabled={open.isPending || !reason.trim()}>
            {open.isPending ? "Opening…" : "Open break-glass"}
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

  if (loading) return <p className="muted">Loading the books…</p>;
  if (error) return <p className="error">Couldn't load the books.</p>;

  return (
    <div className="staff-books">
      <div className="kpis">
        <Kpi label="Accounts" value={String(accountCount)} />
        <Kpi label="Entries" value={String(entries.length)} />
        <Kpi label="Cash & assets" value={formatMoneyShort(bs.totalAssets)} />
        <Kpi label="Net income" value={formatMoneyShort(pnl.netIncome)} tone={pnl.netIncome >= 0 ? "good" : "bad"} />
      </div>
      {!tb.balanced && (
        <p className="warn-banner">Books don't tie — debits {formatMoney(tb.totalDebit)} ≠ credits {formatMoney(tb.totalCredit)}.</p>
      )}
      <h3 className="section-h">Latest activity</h3>
      {recent.length === 0 ? (
        <p className="muted">No entries yet.</p>
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
