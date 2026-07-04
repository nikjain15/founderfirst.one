/**
 * Internal admin console (card IA-3, Phase 0 scaffold) — penny.founderfirst.one/admin.
 *
 * An in-product console for platform staff that mirrors the founderfirst.one/admin
 * IA (four primary jobs + ⚙️ Settings) so ops runs from inside the product they
 * operate. STRICTLY ADDITIVE: founderfirst.one/admin (apps/admin) is untouched and
 * stays fully live and authoritative — this is parallel-run scaffolding
 * (docs/plans/ia-3-admin-console-migration.md §0).
 *
 * This phase ships the gated shell plus ONE live-wired read-only module (Overview,
 * over the existing staff `staff_list_orgs` RPC) to prove the React-Query rail. The
 * four mirror tabs are honest parallel-run placeholders that link to the live admin
 * — never fake empty tabs. Later phases mirror each tab against the SAME back-end.
 *
 * The database enforces access (is_platform_staff / the same admins allow-list as
 * the live admin); the UI gate here is a courtesy. Penny brand, design-system
 * authed header (.eyebrow + .page-title), ink-active tabs, responsive.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import AccountMenu from "../components/AccountMenu";
import { SITE } from "@ff/site";
import { COPY } from "../copy";
import { useStaffOrgs, type StaffOrg } from "../staff/api";
import { CONSOLE_TABS, DEFAULT_CONSOLE_TAB, consoleView, isTabLive, type ConsoleTabId } from "./nav";

const C = COPY.console;

export default function AdminConsole({ isStaff }: { isStaff: boolean }) {
  const { session, signOut } = useAuth();
  const [tab, setTab] = useState<ConsoleTabId>(DEFAULT_CONSOLE_TAB);

  if (consoleView(isStaff) === "denied") {
    return (
      <div className="shell">
        <ConsoleBar email={session?.user.email} signOut={signOut} />
        <main className="workspace">
          <div className="ledger-empty">
            <h3>{C.denied.title}</h3>
            <p className="muted">{C.denied.body}</p>
            <Link className="ghost" to="/">{C.denied.back}</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <ConsoleBar email={session?.user.email} signOut={signOut} />
      <main className="workspace">
        <section className="lens admin-console">
          <header className="ledger-head">
            <p className="eyebrow lens-eyebrow">{C.eyebrow}</p>
            <h1 className="page-title">{C.title}</h1>
            <p className="page-sub">{C.sub}</p>
            <span className="readonly-chip staff-chip">{C.staffChip}</span>
          </header>

          <ConsoleTabs active={tab} onSelect={setTab} />

          {isTabLive(tab) ? <Overview /> : <Placeholder tab={tab} />}
        </section>
      </main>
    </div>
  );
}

function ConsoleBar({ email, signOut }: { email?: string; signOut: () => Promise<void> | void }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/" title={COPY.nav.brandTitle(SITE.company)}>
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
          {COPY.nav.penny}
        </Link>
        <span className="role-pill role-staff">{C.roleStaff}</span>
        <span className="spacer" />
        <AccountMenu email={email}>
          <div className="acct-sep" />
          <Link className="acct-item" role="menuitem" to="/">{C.backToPenny}</Link>
          <div className="acct-sep" />
          <button className="acct-item acct-signout" role="menuitem" onClick={() => void signOut()}>
            {COPY.nav.signOut}
          </button>
        </AccountMenu>
      </div>
    </header>
  );
}

/** Ink-active tab strip (arrow-key navigable) — same pattern as the ledger lens. */
function ConsoleTabs({ active, onSelect }: { active: ConsoleTabId; onSelect: (id: ConsoleTabId) => void }) {
  return (
    <nav className="ledger-tabs" role="tablist" aria-label={C.tabsAria}>
      {CONSOLE_TABS.map((t, i) => (
        <button
          key={t.id} role="tab" id={`console-${t.id}`}
          aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1}
          className={`ledger-tab${active === t.id ? " on" : ""}`}
          onClick={() => onSelect(t.id)}
          onKeyDown={(e) => {
            if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
            e.preventDefault();
            const n = CONSOLE_TABS.length;
            const j = e.key === "ArrowRight" ? (i + 1) % n
              : e.key === "ArrowLeft" ? (i - 1 + n) % n
              : e.key === "Home" ? 0 : n - 1;
            onSelect(CONSOLE_TABS[j].id);
            e.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[j]?.focus();
          }}
        >
          {C.tabs[t.id]}
        </button>
      ))}
    </nav>
  );
}

// ── Overview — the one live-wired module (read-only over staff_list_orgs) ──────
function Overview() {
  const orgs = useStaffOrgs(true);
  const [q, setQ] = useState("");

  const rows = orgs.data ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((o) => o.name.toLowerCase().includes(needle)) : rows;
  }, [rows, q]);

  return (
    <div className="console-overview" role="tabpanel" aria-labelledby="console-overview">
      <h3 className="section-h">{C.overview.heading}</h3>
      <p className="muted sm">{C.overview.breakGlassNote}</p>
      <p><Link className="ghost sm" to="/staff">{C.overview.openConsole}</Link></p>

      {orgs.isLoading ? (
        <p className="muted">{C.overview.loading}</p>
      ) : orgs.isError ? (
        <p className="error">{C.overview.error}</p>
      ) : (
        <>
          <div className="panel-toolbar">
            <span className="muted">{C.overview.total(rows.length)}</span>
            <input
              className="staff-search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={C.overview.searchPlaceholder} aria-label={C.overview.searchAria}
            />
          </div>
          {filtered.length === 0 ? (
            <div className="ledger-empty"><p className="muted">{C.overview.empty}</p></div>
          ) : (
            <div className="table-wrap">
              <table className="console-table" aria-label={C.overview.tableAria}>
                <thead>
                  <tr>
                    <th>{C.overview.colName}</th>
                    <th>{C.overview.colType}</th>
                    <th className="num">{C.overview.colEntries}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o: StaffOrg) => (
                    <tr key={o.id}>
                      <td>{o.name}</td>
                      <td>{o.type}</td>
                      <td className="num">{o.entry_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Parallel-run placeholder — links to the still-authoritative live admin ─────
function Placeholder({ tab }: { tab: ConsoleTabId }) {
  const label = C.tabs[tab];
  return (
    <div className="console-placeholder" role="tabpanel" aria-labelledby={`console-${tab}`}>
      <span className="readonly-chip">{C.placeholder.badge}</span>
      <p className="muted">{C.placeholder.body(label)}</p>
      <p>
        <a className="ghost" href={SITE.adminUrl} target="_blank" rel="noreferrer">
          {C.placeholder.openLive}
        </a>
      </p>
    </div>
  );
}
