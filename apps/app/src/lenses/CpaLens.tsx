/** CPA lens — the client's books, defaulting to Books → Journal (the CPA's
 *  working surface). read_only engagements see everything but every mutation is
 *  disabled in the UI and refused server-side (ARCHITECTURE.md §B8). The ranked
 *  workqueue + reconciliation land in later phases. */
import type { Org, RoleInfo } from "../org/ActiveOrgProvider";
import Ledger from "../ledger/Ledger";

export default function CpaLens({ org, roleInfo }: { org: Org; roleInfo: RoleInfo }) {
  return <Ledger org={org} canWrite={roleInfo.canWrite} nav="cpa" defaultTabId="books" eyebrow="Client books" />;
}
