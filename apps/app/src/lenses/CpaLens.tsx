/** CPA lens — default view is the client workqueue (ARCHITECTURE.md §B8). Stub
 *  for now. read_only engagements see the queue but mutation actions are disabled
 *  (reflected here via the access badge; real enforcement is server-side). */
import type { Org, RoleInfo } from "../org/ActiveOrgProvider";

export default function CpaLens({ org, roleInfo }: { org: Org; roleInfo: RoleInfo }) {
  const isPractice = roleInfo.via === "membership" && org.type === "firm";
  return (
    <section className="lens">
      <h1>{org.name}</h1>
      <p className="muted">
        {isPractice ? "CPA practice" : "Client books"} —{" "}
        {roleInfo.canWrite ? "full access" : "read-only access"}.
        {" "}Workqueue + ledger land next.
      </p>
      <ul className="lens-stub">
        <li>Ranked workqueue across clients</li>
        <li>Double-entry ledger · reconciliation · period close</li>
        <li>Learned categorization rules</li>
      </ul>
      {!roleInfo.canWrite && (
        <p className="readonly-note">
          You have read-only access to this client — posting and close actions are
          disabled.
        </p>
      )}
    </section>
  );
}
