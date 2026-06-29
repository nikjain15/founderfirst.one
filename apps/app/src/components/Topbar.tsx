/** Shared top bar: brand, org-switcher, current lens/role, account. */
import { useAuth } from "../auth/AuthProvider";
import { useActiveOrg } from "../org/ActiveOrgProvider";
import { SITE } from "@ff/site";

export default function Topbar() {
  const { session, signOut } = useAuth();
  const { orgs, activeOrg, roleInfo, setActiveOrgId } = useActiveOrg();

  return (
    <header className="topbar">
      <span className="brand" title={`Penny by ${SITE.company}`}>
        <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
        Penny
      </span>

      {orgs.length > 0 && (
        <select
          className="org-switcher"
          value={activeOrg?.id ?? ""}
          onChange={(e) => setActiveOrgId(e.target.value)}
          aria-label="Active organization"
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.type}
            </option>
          ))}
        </select>
      )}

      {roleInfo && (
        <span className={`role-pill role-${roleInfo.lens}`}>
          {roleInfo.lens === "owner" ? "Owner" : "CPA"}
          {!roleInfo.canWrite && " · read-only"}
        </span>
      )}

      <span className="spacer" />
      <span className="muted">{session?.user.email}</span>
      <button className="ghost" onClick={() => void signOut()}>Sign out</button>
    </header>
  );
}
