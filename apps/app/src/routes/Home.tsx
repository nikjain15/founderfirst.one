/**
 * Authed home: top bar + the role-scoped lens for the active org. The lens is
 * chosen from the derived role (owner vs cpa); data + RLS are identical underneath
 * — only the default view and affordances differ (ARCHITECTURE.md §B1).
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar";
import { useActiveOrg } from "../org/ActiveOrgProvider";
import Onboarding from "../onboarding/Onboarding";
import OwnerLens from "../lenses/OwnerLens";
import CpaLens from "../lenses/CpaLens";
import { SITE } from "@ff/site";
import { COPY } from "../copy";

export default function Home() {
  const { loading, error, orgs, activeOrg, roleInfo } = useActiveOrg();
  const nav = useNavigate();

  // Resume an invite the user opened before signing in.
  useEffect(() => {
    const pending = localStorage.getItem("ff.pendingInvite");
    if (pending) {
      localStorage.removeItem("ff.pendingInvite");
      nav(`/accept?token=${encodeURIComponent(pending)}`, { replace: true });
    }
  }, [nav]);

  return (
    <div className="shell">
      <Topbar />
      <main className="workspace">
        {loading && <p className="muted">{COPY.common.loadingWorkspaces}</p>}
        {error && (
          <p className="error" role="alert">{COPY.home.loadError(SITE.email)}</p>
        )}

        {/* No books yet → the minimal 3-step onboarding (W3.3): name → entity →
            industry, everything else asked in-journey. The old bare CreateOrg form
            is superseded (it still lives in the org switcher for "+ New org"). */}
        {!loading && !error && orgs.length === 0 && (
          <Onboarding />
        )}

        {activeOrg && roleInfo?.lens === "owner" && (
          <OwnerLens org={activeOrg} roleInfo={roleInfo} />
        )}
        {activeOrg && roleInfo?.lens === "cpa" && (
          <CpaLens org={activeOrg} roleInfo={roleInfo} />
        )}
        {activeOrg && !roleInfo && (
          <p className="muted">{COPY.home.noMembership}</p>
        )}
        {/* "+ New organization" is no longer stapled to the page body — it lives in
            the org switcher (APP_PRINCIPLES §5), the one place a user goes to change
            which books they're in. */}
      </main>
    </div>
  );
}
