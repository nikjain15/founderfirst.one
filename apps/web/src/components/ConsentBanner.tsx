import { useEffect, useState } from "react";
import { getConsent, setConsent } from "../lib/consent";
import { initAnalytics } from "../lib/analytics";

/**
 * Cookie consent (Option B). Shows only when consent is unset. Accept → PostHog
 * starts capturing; Decline → remembered, no re-prompt. Sits above the Penny
 * launcher (bottom offset clears it, per RESPONSIVE.md rule 6).
 */
export default function ConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    initAnalytics();                       // inits PostHog if already accepted
    setShow(getConsent() === "unset");
  }, []);

  if (!show) return null;

  const choose = (state: "accepted" | "declined") => { setConsent(state); setShow(false); };

  return (
    <div className="consent" role="dialog" aria-label="Cookie consent">
      <p>
        We use cookies to understand how founders use this site so we can build a better
        product. No selling, no ads — just product analytics.
      </p>
      <div className="consent-actions">
        <button onClick={() => choose("declined")} className="ghost">Decline</button>
        <button onClick={() => choose("accepted")} className="solid">Accept</button>
      </div>
    </div>
  );
}
