/**
 * PendingReview — the screen a new owner/firm sees while their signup is awaiting
 * staff approval (the approval gate). Their org + membership exist, but write
 * access is withheld server-side (can_write_org) until approved, so instead of the
 * books we show a calm "we're reviewing" state. A declined org gets an honest
 * message + the support email. Copy is COPY.pending (CENTRAL-1); email is SITE.email.
 */
import type { Org } from "./ActiveOrgProvider";
import { SITE } from "@ff/site";
import { COPY } from "../copy";

export default function PendingReview({ org }: { org: Org }) {
  const declined = org.approval_status === "declined";
  return (
    <section className="lens pending-review">
      <header className="ledger-head">
        <p className="eyebrow lens-eyebrow">{COPY.pending.eyebrow}</p>
        <h1 className="page-title">
          {declined ? COPY.pending.declinedTitle : COPY.pending.title}
        </h1>
      </header>
      <div className="pending-card">
        <span className="p-mark p-mark-lg" aria-hidden="true">P</span>
        <p className="pending-body">
          {declined ? COPY.pending.declinedBody(SITE.email) : COPY.pending.body}
        </p>
        {!declined && <p className="muted sm">{COPY.pending.checkBack}</p>}
      </div>
    </section>
  );
}
