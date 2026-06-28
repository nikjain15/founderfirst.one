/**
 * Authed home: top bar + the role-scoped lens for the active org. The lens is
 * chosen from the derived role (owner vs cpa); data + RLS are identical underneath
 * — only the default view and affordances differ (ARCHITECTURE.md §B1).
 */
import Topbar from "../components/Topbar";
import { useActiveOrg } from "../org/ActiveOrgProvider";
import OwnerLens from "../lenses/OwnerLens";
import CpaLens from "../lenses/CpaLens";

export default function Home() {
  const { loading, error, orgs, activeOrg, roleInfo } = useActiveOrg();

  return (
    <div className="shell">
      <Topbar />
      <main className="workspace">
        {loading && <p className="muted">Loading your workspaces…</p>}
        {error && <p className="error">Couldn't load your workspaces.</p>}

        {!loading && orgs.length === 0 && (
          <div className="empty">
            <h1>Welcome.</h1>
            <p className="muted">
              You don't have any organizations yet. Create-business and
              accept-invite flows land in the next Phase 1 slice.
            </p>
          </div>
        )}

        {activeOrg && roleInfo?.lens === "owner" && <OwnerLens org={activeOrg} />}
        {activeOrg && roleInfo?.lens === "cpa" && (
          <CpaLens org={activeOrg} roleInfo={roleInfo} />
        )}
        {activeOrg && !roleInfo && (
          <p className="muted">You don't have access to this organization.</p>
        )}
      </main>
    </div>
  );
}
