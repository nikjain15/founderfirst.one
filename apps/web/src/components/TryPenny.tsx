import { useState } from "react";
import { SITE } from "../lib/site";

/**
 * Try Penny — interactive demo. Business-owner ↔ CPA toggle swaps a phone frame
 * (mobile app) for a browser frame (web console). The frame embeds the LIVE demo
 * (screen-in-screen); the link below opens it full-screen in a new tab.
 */
type View = "owner" | "cpa";

const DEMO: Record<View, { src: string; label: string }> = {
  owner: { src: "/penny/demo/businessowner/", label: "business-owner" },
  cpa: { src: "/penny/demo/cpa/", label: "CPA" },
};

export default function TryPenny({ ownerSub, cpaSub }: { ownerSub: string; cpaSub: string }) {
  const [view, setView] = useState<View>("owner");

  return (
    <div className="tp">
      <p className="tp-sub">{view === "owner" ? ownerSub : cpaSub}</p>

      <div className="tp-toggle" role="tablist" aria-label="Choose a perspective">
        <button role="tab" aria-selected={view === "owner"} className={`tp-pill ${view === "owner" ? "on" : ""}`} onClick={() => setView("owner")}>
          <span className="dot" /> Business owner
        </button>
        <button role="tab" aria-selected={view === "cpa"} className={`tp-pill ${view === "cpa" ? "on" : ""}`} onClick={() => setView("cpa")}>
          <span className="dot" /> CPA
        </button>
      </div>

      {view === "owner" ? (
        <div className="phone">
          <div className="notch" />
          <div className="screen"><Demo mode="owner" /></div>
        </div>
      ) : (
        <div className="browser">
          <div className="bar"><span/><span/><span/><em>penny.app/cpa</em></div>
          <div className="screen"><Demo mode="cpa" /></div>
        </div>
      )}

      <div className="tp-cta">
        <a className="tp-launch" href={`${DEMO_ORIGIN}${DEMO[view].src}`} target="_blank" rel="noopener">
          Try the full {DEMO[view].label} demo →
        </a>
        <span className="tp-cta-note">Click through it right here, or open it full-screen.</span>
      </div>
    </div>
  );
}

// Always embed the REAL, live Penny demo (the same interactive product deployed
// at /penny/demo/*) — never a placeholder. In production it's same-origin; in dev
// the web server doesn't serve those paths, so we load them from the production
// origin so the preview shows the actual real-time product, not a mock.
const DEMO_ORIGIN = import.meta.env.PROD ? "" : SITE.url;

function Demo({ mode }: { mode: View }) {
  return (
    <iframe
      src={`${DEMO_ORIGIN}${DEMO[mode].src}`}
      title={`Penny ${DEMO[mode].label} demo`}
      loading="lazy"
    />
  );
}
