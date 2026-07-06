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
import {
  useStaffOrgs, useStaffTickets,
  type StaffOrg, type StaffTicket, type TicketStatus,
} from "../staff/api";
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

  // founderfirst.one/admin pattern: one top nav bar carries the brand + the primary
  // tabs inline; each module owns its own eyebrow + heading below (no global title).
  return (
    <div className="shell">
      <ConsoleBar email={session?.user.email} signOut={signOut} active={tab} onSelect={setTab} />
      <main className="workspace">
        <section className="lens admin-console">
          {isTabLive(tab)
            ? (tab === "support" ? <Support /> : <Overview />)
            : <Placeholder tab={tab} />}
        </section>
      </main>
    </div>
  );
}

function ConsoleBar({
  email, signOut, active, onSelect,
}: {
  email?: string; signOut: () => Promise<void> | void;
  active?: ConsoleTabId; onSelect?: (id: ConsoleTabId) => void;
}) {
  return (
    <header className="topbar console-topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/" title={COPY.nav.brandTitle(SITE.company)}>
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
          {COPY.nav.penny}
        </Link>
        <span className="role-pill role-staff">{C.roleStaff}</span>
        {active !== undefined && onSelect && (
          <ConsoleTabs active={active} onSelect={onSelect} />
        )}
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

/** Primary tabs — inline in the nav bar (founderfirst.one/admin pattern), ink-active
 *  underline, arrow-key navigable. Sub-tabs (when a module has them) render below. */
function ConsoleTabs({ active, onSelect }: { active: ConsoleTabId; onSelect: (id: ConsoleTabId) => void }) {
  return (
    <nav className="console-nav" role="tablist" aria-label={C.tabsAria}>
      {CONSOLE_TABS.map((t, i) => (
        <button
          key={t.id} role="tab" id={`console-${t.id}`}
          aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1}
          className={`console-navlink${active === t.id ? " active" : ""}`}
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

/** Per-page header — eyebrow over a restrained serif title, matching the live admin
 *  (e.g. "STAFF · SUPPORT" / "What needs you."). No global "Admin console" billboard. */
function ConsoleHead({ tab, title, sub }: { tab: ConsoleTabId; title: string; sub?: string }) {
  return (
    <header className="console-head">
      <p className="eyebrow">{C.pageEyebrow[tab]}</p>
      <h1 className="page-title">{title}</h1>
      {sub && <p className="page-sub">{sub}</p>}
    </header>
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
      <ConsoleHead tab="overview" title={C.overview.heading} />
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
            <div className="table-wrap" tabIndex={0} role="region" aria-label={C.overview.tableAria}>
              <table className="console-table">
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

// ── Support — slice-1 live-wired tab. Reads the SAME list_tickets RPC the live ──
//    admin inbox reads (one source of truth). Read-only here: replies still land
//    in the live admin until that module reaches parity.
const SUPPORT_FILTERS: (TicketStatus | undefined)[] = ["open", "in_progress", "resolved", undefined];

function Support() {
  const [status, setStatus] = useState<TicketStatus | undefined>("open");
  const tickets = useStaffTickets(status);
  const rows = tickets.data ?? [];
  const S = C.support;

  return (
    <div className="console-support" role="tabpanel" aria-labelledby="console-support">
      <ConsoleHead tab="support" title={S.heading} sub={S.sub} />
      <p className="muted sm">{S.liveNote}</p>

      <nav className="console-filters" role="group" aria-label={S.filtersAria}>
        {SUPPORT_FILTERS.map((f) => {
          const key = f ?? "all";
          return (
            <button
              key={key} type="button"
              className={`chip${status === f ? " on" : ""}`}
              aria-pressed={status === f}
              onClick={() => setStatus(f)}
            >
              {S.filters[key as keyof typeof S.filters]}
            </button>
          );
        })}
      </nav>

      {tickets.isLoading ? (
        <p className="muted">{S.loading}</p>
      ) : tickets.isError ? (
        <p className="error">{S.error}</p>
      ) : rows.length === 0 ? (
        <div className="ledger-empty"><p className="muted">{S.empty}</p></div>
      ) : (
        <>
          <div className="panel-toolbar">
            <span className="muted">{S.total(rows.length)}</span>
          </div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label={S.tableAria}>
            <table className="console-table">
              <thead>
                <tr>
                  <th>{S.colSubject}</th>
                  <th>{S.colChannel}</th>
                  <th>{S.colTopic}</th>
                  <th>{S.colContact}</th>
                  <th className="num">{S.colMessages}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t: StaffTicket) => (
                  <tr key={t.id}>
                    <td>
                      <span className={`priority-pill ${t.priority}`}>{t.priority.toUpperCase()}</span>{" "}
                      <a
                        className="ghost" href={`${SITE.adminUrl}/support/${t.id}`}
                        target="_blank" rel="noreferrer" title={S.openInAdmin}
                      >
                        {t.subject || S.noSubject}
                      </a>
                    </td>
                    <td>{t.channel}</td>
                    <td>{t.topic || S.noTopic}</td>
                    <td>{t.contact_email || t.contact_discord || S.noContact}</td>
                    <td className="num">{t.message_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Parallel-run placeholder — links to the still-authoritative live admin ─────
function Placeholder({ tab }: { tab: ConsoleTabId }) {
  const label = C.tabs[tab];
  return (
    <div role="tabpanel" aria-labelledby={`console-${tab}`}>
      <ConsoleHead tab={tab} title={label} />
      <div className="console-placeholder">
        <span className="readonly-chip">{C.placeholder.badge}</span>
        <p className="muted">{C.placeholder.body(label)}</p>
        <p>
          <a className="ghost" href={SITE.adminUrl} target="_blank" rel="noreferrer">
            {C.placeholder.openLive}
          </a>
        </p>
      </div>
    </div>
  );
}
