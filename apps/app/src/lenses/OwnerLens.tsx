/** Business Owner lens — the books, led by a plain-language Overview, plus the
 *  invite-your-accountant action (ARCHITECTURE.md §B7). canWrite comes from the
 *  derived role; real enforcement is server-side. */
import type { Org, RoleInfo } from "../org/ActiveOrgProvider";
import Ledger from "../ledger/Ledger";
import InviteCpa from "../org/InviteCpa";
import ApprovalSetting from "../org/ApprovalSetting";

export default function OwnerLens({ org, roleInfo }: { org: Org; roleInfo: RoleInfo }) {
  return (
    <>
      <Ledger org={org} canWrite={roleInfo.canWrite} defaultTab="overview" />
      <div className="lens-aside">
        <InviteCpa orgId={org.id} />
        <ApprovalSetting orgId={org.id} />
      </div>
    </>
  );
}
