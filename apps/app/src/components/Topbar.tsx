/** Shared top bar: brand + org-switcher, with everything secondary (role,
 *  Settings, Staff console, Sign out) parked in a single ⚙️ menu — mirrors /admin
 *  so the bar stays calm instead of a row of loose links. */
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useActiveOrg } from "../org/ActiveOrgProvider";
import { useIsPlatformStaff } from "../staff/api";
import AccountMenu from "./AccountMenu";
import OrgSwitcher from "./OrgSwitcher";
import { SITE } from "@ff/site";

export default function Topbar() {
  const { session, signOut } = useAuth();
  const { orgs, activeOrg, roleInfo, setActiveOrgId } = useActiveOrg();
  const isStaff = useIsPlatformStaff();

  const roleLabel = roleInfo
    ? roleInfo.lens === "owner" ? "Owner" : roleInfo.canWrite ? "CPA" : "CPA · read-only"
    : null;

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/" title={`Penny by ${SITE.company}`}>
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
          Penny
        </Link>

        <OrgSwitcher orgs={orgs} activeOrg={activeOrg} onSelect={setActiveOrgId} />

        <span className="spacer" />

        <AccountMenu email={session?.user.email}>
          {roleLabel && activeOrg && (
            <div className="acct-role">{roleLabel} · {activeOrg.name}</div>
          )}
          <div className="acct-sep" />
          {roleInfo?.lens === "owner" && (
            <Link className="acct-item" role="menuitem" to="/settings">Settings</Link>
          )}
          {isStaff.data && (
            <Link className="acct-item" role="menuitem" to="/staff">Staff console</Link>
          )}
          <div className="acct-sep" />
          <button className="acct-item acct-signout" role="menuitem" onClick={() => void signOut()}>
            Sign out
          </button>
        </AccountMenu>
      </div>
    </header>
  );
}
