/**
 * ContactSupport (IQ-2) — the always-reachable "we're here" affordance.
 *
 * A single, discoverable way to reach a human, shown on Connections and in error
 * states so an owner is never stuck with no path forward. The address is ALWAYS
 * SITE.email (`@ff/site`) — never hardcoded (centralization gate) — and the copy
 * always comes from COPY.connections.
 */
import { SITE } from "@ff/site";
import { COPY } from "../copy";

export default function ContactSupport({ compact = false }: { compact?: boolean }) {
  const href = `mailto:${SITE.email}?subject=${encodeURIComponent(COPY.connections.supportSubject)}`;
  return (
    <p className={`contact-support${compact ? " sm" : ""}`}>
      {!compact && <span className="muted">{COPY.connections.supportLead} </span>}
      <a href={href} aria-label={COPY.connections.supportAria(SITE.email)}>
        {COPY.connections.supportLink}
      </a>
    </p>
  );
}
