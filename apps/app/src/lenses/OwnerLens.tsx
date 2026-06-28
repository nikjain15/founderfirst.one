/** Business Owner lens — default view is "How's my business" (ARCHITECTURE.md
 *  §B7). Stub cockpit for now; the owner can already invite their accountant. */
import type { Org } from "../org/ActiveOrgProvider";
import InviteCpa from "../org/InviteCpa";

export default function OwnerLens({ org }: { org: Org }) {
  return (
    <section className="lens">
      <h1>{org.name}</h1>
      <p className="muted">Owner workspace — "How's my business" cockpit lands next.</p>
      <ul className="lens-stub">
        <li>Cash position · P&amp;L · what needs attention</li>
        <li>Tap-to-confirm categorization</li>
        <li>Receipt capture (PWA)</li>
      </ul>
      <InviteCpa orgId={org.id} />
    </section>
  );
}
