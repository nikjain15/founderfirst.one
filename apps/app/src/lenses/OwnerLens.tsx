/** Business Owner lens — the books, led by a plain-language Overview, plus the
 *  invite-your-accountant action (ARCHITECTURE.md §B7). canWrite comes from the
 *  derived role; real enforcement is server-side. */
import { useNavigate } from "react-router-dom";
import type { Org, RoleInfo } from "../org/ActiveOrgProvider";
import Ledger from "../ledger/Ledger";

export default function OwnerLens({ org, roleInfo }: { org: Org; roleInfo: RoleInfo }) {
  const navigate = useNavigate();
  // Owner-only controls (invite an accountant, review-before-post) live under the
  // top-bar ⚙️ menu → /settings now, not stacked on every page. The Overview's
  // first-time nudge routes there too.
  return (
    <Ledger
      org={org}
      canWrite={roleInfo.canWrite}
      defaultTab="overview"
      eyebrow="Your books"
      onInvite={() => navigate("/settings")}
    />
  );
}
