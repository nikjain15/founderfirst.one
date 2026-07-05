/**
 * Org settings (owner-only) — reached from the top-bar ⚙️ menu, mirroring the
 * /admin Settings pattern. Holds the invite-accountant + review-before-post
 * controls that used to sit on every Overview. Pure relocation: the components
 * and their write-paths are unchanged.
 */
import { Navigate } from "react-router-dom";
import Topbar from "../components/Topbar";
import { useActiveOrg } from "../org/ActiveOrgProvider";
import InviteCpa from "../org/InviteCpa";
import ApprovalSetting from "../org/ApprovalSetting";
import MultiCurrencySetting from "../org/MultiCurrencySetting";
import MfaRequiredSetting from "../org/MfaRequiredSetting";
import { COPY } from "../copy";

export default function Settings() {
  const { loading, activeOrg, roleInfo } = useActiveOrg();

  return (
    <div className="shell">
      <Topbar />
      <main className="workspace">
        {loading ? (
          <p className="muted">{COPY.common.loading}</p>
        ) : !activeOrg || roleInfo?.lens !== "owner" ? (
          // Settings is owner-only; anyone else goes back to their books.
          <Navigate to="/" replace />
        ) : (
          <section className="lens">
            <header className="ledger-head">
              <p className="eyebrow lens-eyebrow">{COPY.settings.eyebrow}</p>
              <h1 className="page-title">{activeOrg.name}</h1>
            </header>
            <div className="ledger-settings">
              <InviteCpa orgId={activeOrg.id} />
              <ApprovalSetting orgId={activeOrg.id} />
              <MultiCurrencySetting orgId={activeOrg.id} />
              <MfaRequiredSetting orgId={activeOrg.id} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
