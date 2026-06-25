import { useState } from "react";

/**
 * Try Penny — the interactive demo section carried over from the legacy site
 * (kept per brand guidelines). Business-owner ↔ CPA toggle swaps between a phone
 * frame and a browser frame. Each frame embeds the live Penny demo; until the
 * demo sub-app is ported into apps/web it shows an on-brand placeholder.
 */
type View = "owner" | "cpa";

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
          <div className="screen"><Demo which="the business-owner demo" /></div>
        </div>
      ) : (
        <div className="browser">
          <div className="bar"><span/><span/><span/><em>penny.app/cpa</em></div>
          <div className="screen"><Demo which="the CPA demo" /></div>
        </div>
      )}
    </div>
  );
}

// On-brand placeholder. The live Penny demo embeds here once the demo sub-app is
// ported into apps/web (it lives under /penny/demo/* on the legacy site).
function Demo({ which }: { which: string }) {
  return (
    <div className="tp-ph">
      <span className="p-badge">P</span>
      <strong>Hi, I'm Penny.</strong>
      <p>{which} drops in here once it's wired into the new site.</p>
    </div>
  );
}
