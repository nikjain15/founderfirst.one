/** Shared top bar: brand + org-switcher, with everything secondary (role,
 *  Settings, Staff console, Sign out) parked in a single ⚙️ menu — mirrors /admin
 *  so the bar stays calm instead of a row of loose links. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useActiveOrg } from "../org/ActiveOrgProvider";
import { useIsPlatformStaff } from "../staff/api";
import AccountMenu from "./AccountMenu";
import OrgSwitcher from "./OrgSwitcher";
import CreateOrg from "../org/CreateOrg";
import AddClient from "../org/AddClient";
import { useClientCounts } from "../lenses/practiceQueue";
import { SITE } from "@ff/site";
import { COPY } from "../copy";

export default function Topbar() {
  const { session, signOut } = useAuth();
  const { orgs, activeOrg, roleInfo, setActiveOrgId } = useActiveOrg();
  const isStaff = useIsPlatformStaff();
  // When a CPA is on their practice, badge the switcher's client list with each
  // client's open-item count (APP_PRINCIPLES §3 — "counts on the switcher").
  const firmId = activeOrg?.type === "firm" ? activeOrg.id : undefined;
  const clientCounts = useClientCounts(firmId);
  const counts = clientCounts.data
    ? Object.fromEntries(clientCounts.data.map((c) => [c.client_org_id, c.total]))
    : undefined;
  // "+ New organization" opens an inline panel under the bar (APP_PRINCIPLES §5) —
  // launched from the org switcher, not stapled to the page body.
  const [creating, setCreating] = useState(false);
  // "+ Add client" (PENNY-UX-4) — the CPA's add-a-client job, firm contexts only
  // (APP_PRINCIPLES §3). Same panel slot as create; opening one closes the other.
  const [addingClient, setAddingClient] = useState(false);
  const isFirm = activeOrg?.type === "firm";

  const roleLabel = roleInfo
    ? roleInfo.lens === "owner" ? COPY.nav.roleOwner : roleInfo.canWrite ? COPY.nav.roleCpa : COPY.nav.roleCpaReadonly
    : null;

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/" title={COPY.nav.brandTitle(SITE.company)}>
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
          {COPY.nav.penny}
        </Link>

        <OrgSwitcher orgs={orgs} activeOrg={activeOrg} onSelect={setActiveOrgId}
          onCreateOrg={() => { setAddingClient(false); setCreating(true); }}
          onAddClient={isFirm ? () => { setCreating(false); setAddingClient(true); } : undefined}
          counts={counts} />

        <span className="spacer" />

        <AccountMenu email={session?.user.email}>
          {roleLabel && activeOrg && (
            <div className="acct-role">{roleLabel} · {activeOrg.name}</div>
          )}
          <div className="acct-sep" />
          <Link className="acct-item" role="menuitem" to="/security">{COPY.security.menuLabel}</Link>
          {roleInfo?.lens === "owner" && (
            <Link className="acct-item" role="menuitem" to="/settings">{COPY.nav.settings}</Link>
          )}
          {isStaff.data && (
            <Link className="acct-item" role="menuitem" to="/admin">{COPY.nav.adminConsole}</Link>
          )}
          {isStaff.data && (
            <Link className="acct-item" role="menuitem" to="/staff">{COPY.nav.staffConsole}</Link>
          )}
          <div className="acct-sep" />
          <button className="acct-item acct-signout" role="menuitem" onClick={() => void signOut()}>
            {COPY.nav.signOut}
          </button>
        </AccountMenu>
      </div>
      {creating && (
        <div className="topbar-create">
          <div className="topbar-create-inner">
            <CreateOrg onDone={() => setCreating(false)} />
            <button className="ghost sm" onClick={() => setCreating(false)}>{COPY.common.cancel}</button>
          </div>
        </div>
      )}
      {addingClient && isFirm && (
        <div className="topbar-create">
          <div className="topbar-create-inner">
            <AddClient />
            <button className="ghost sm" onClick={() => setAddingClient(false)}>{COPY.common.cancel}</button>
          </div>
        </div>
      )}
    </header>
  );
}
