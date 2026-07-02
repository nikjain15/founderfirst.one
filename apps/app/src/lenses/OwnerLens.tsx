/** Business Owner lens — navigates by plain-language jobs (APP_PRINCIPLES §2):
 *  Home · Review · Reports · Connections, plus a de-emphasized Advanced for the
 *  accountant-grade ledger. The owner-vocabulary nav lives in Ledger (nav="owner").
 *  canWrite comes from the derived role; real enforcement is server-side. */
import { useNavigate } from "react-router-dom";
import type { Org, RoleInfo } from "../org/ActiveOrgProvider";
import Ledger from "../ledger/Ledger";
import { COPY } from "../copy";

export default function OwnerLens({ org, roleInfo }: { org: Org; roleInfo: RoleInfo }) {
  const navigate = useNavigate();
  // The invite-accountant control also lives in the Connections tab now; the ⚙️
  // menu → /settings path stays for the review-before-post setting.
  return (
    <Ledger
      org={org}
      canWrite={roleInfo.canWrite}
      nav="owner"
      eyebrow={COPY.ledger.eyebrowOwner}
      onInvite={() => navigate("/settings")}
    />
  );
}
