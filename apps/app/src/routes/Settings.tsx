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

export default function Settings() {
  const { loading, activeOrg, roleInfo } = useActiveOrg();

  return (
    <div className="shell">
      <Topbar />
      <main className="workspace">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : !activeOrg || roleInfo?.lens !== "owner" ? (
          // Settings is owner-only; anyone else goes back to their books.
          <Navigate to="/" replace />
        ) : (
          <section className="lens">
            <header className="ledger-head">
              <p className="eyebrow lens-eyebrow">Settings</p>
              <h1 className="page-title">{activeOrg.name}</h1>
            </header>
            <div className="ledger-settings">
              <InviteCpa orgId={activeOrg.id} />
              <ApprovalSetting orgId={activeOrg.id} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
