/**
 * Authed home: top bar + the role-scoped lens for the active org. The lens is
 * chosen from the derived role (owner vs cpa); data + RLS are identical underneath
 * — only the default view and affordances differ (ARCHITECTURE.md §B1).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar";
import { useActiveOrg } from "../org/ActiveOrgProvider";
import CreateOrg from "../org/CreateOrg";
import OwnerLens from "../lenses/OwnerLens";
import CpaLens from "../lenses/CpaLens";
import { SITE } from "@ff/site";

export default function Home() {
  const { loading, error, orgs, activeOrg, roleInfo } = useActiveOrg();
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();

  // Resume an invite the user opened before signing in.
  useEffect(() => {
    const pending = localStorage.getItem("ff.pendingInvite");
    if (pending) {
      localStorage.removeItem("ff.pendingInvite");
      nav(`/accept?token=${pending}`, { replace: true });
    }
  }, [nav]);

  return (
    <div className="shell">
      <Topbar />
      <main className="workspace">
        {loading && <p className="muted">Loading your workspaces…</p>}
        {error && (
          <p className="error" role="alert">
            We couldn't load your workspaces just now — please refresh. If it keeps happening, email {SITE.email}.
          </p>
        )}

        {!loading && !error && orgs.length === 0 && (
          <div className="empty">
            <span className="p-mark p-mark-lg welcome-mark" aria-hidden="true">P</span>
            <h1>Welcome.</h1>
            <p className="muted">Create your first organization and Penny will start keeping your books.</p>
            <CreateOrg />
          </div>
        )}

        {activeOrg && roleInfo?.lens === "owner" && (
          <OwnerLens org={activeOrg} roleInfo={roleInfo} />
        )}
        {activeOrg && roleInfo?.lens === "cpa" && (
          <CpaLens org={activeOrg} roleInfo={roleInfo} />
        )}
        {activeOrg && !roleInfo && (
          <p className="muted">
            You're not currently on this organization's books — you may have left it, or an invite was revoked.
            Switch to one of yours above, or ask the owner to re-invite you.
          </p>
        )}

        {orgs.length > 0 && (
          <div className="new-org">
            {creating ? (
              <CreateOrg onDone={() => setCreating(false)} />
            ) : (
              <button className="ghost" onClick={() => setCreating(true)}>
                + New organization
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
