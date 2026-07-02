/** CPA lens — a firm-level Practice home + per-client books (APP_PRINCIPLES §3).
 *
 * The org switcher IS the CPA's client list; the FIRM org is the practice itself.
 * So:
 *   • active org = the firm  → the Practice home: ONE ranked work queue across
 *     every client (card W1.4).
 *   • active org = a client  → that client's books (Journal · Categorize · CoA ·
 *     Reports · Periods), defaulting to Journal.
 *
 * A queue row switches the active org to the client and deep-links the resolving
 * tab, so any item is clearable in ≤2 taps. read_only engagements see the queue
 * and the books but every mutation is disabled in the UI and refused server-side
 * (ARCHITECTURE §4.3). */
import { useState } from "react";
import type { Org, RoleInfo } from "../org/ActiveOrgProvider";
import { useActiveOrg } from "../org/ActiveOrgProvider";
import Ledger from "../ledger/Ledger";
import PracticeHome from "./PracticeHome";
import type { Surface } from "../ledger/nav";
import { COPY } from "../copy";

export default function CpaLens({ org, roleInfo }: { org: Org; roleInfo: RoleInfo }) {
  const { setActiveOrgId } = useActiveOrg();
  // The surface to open when we land on a client's books, chosen by the queue row
  // that routed us here. Keyed to the client so a stale target can't leak to the
  // wrong org: it only applies when the active org matches.
  const [target, setTarget] = useState<{ orgId: string; surface: Surface } | null>(null);

  const openClient = (clientOrgId: string, surface: Surface) => {
    setTarget({ orgId: clientOrgId, surface });
    setActiveOrgId(clientOrgId);
  };

  // The firm itself → Practice home (the firm-level landing).
  if (org.type === "firm") {
    return <PracticeHome firm={org} open={openClient} />;
  }

  // A client's books. `initialSurface` deep-links the queue's resolving tab, but
  // only when this is the org the queue routed us to.
  const initialSurface = target?.orgId === org.id ? target.surface : undefined;
  return (
    <Ledger
      org={org}
      canWrite={roleInfo.canWrite}
      nav="cpa"
      defaultTabId="books"
      initialSurface={initialSurface}
      eyebrow={COPY.ledger.eyebrowClient}
    />
  );
}
