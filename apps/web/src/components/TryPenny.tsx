import { useState } from "react";

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
        <a className="tp-launch" href={DEMO[view].src} target="_blank" rel="noopener">
          Try the full {DEMO[view].label} demo →
        </a>
        <span className="tp-cta-note">Click through it right here, or open it full-screen.</span>
      </div>
    </div>
  );
}

// In production the live Penny demo (deployed at /penny/demo/*) is embedded in
// the frame. In dev those paths 404 (the demo isn't served by the web dev
// server), so show an on-brand mock so the frame is never empty.
function Demo({ mode }: { mode: View }) {
  if (import.meta.env.PROD) {
    return <iframe src={DEMO[mode].src} title={`Penny ${DEMO[mode].label} demo`} loading="lazy" />;
  }
  return mode === "owner" ? (
    <div className="tp-mock tp-mock-owner">
      <div className="tpm-top"><span className="p-badge">P</span><div><strong>Penny</strong><span>Categorized just now</span></div></div>
      <div className="tpm-card">
        <div className="tpm-row"><span>Terra Wholesale</span><strong>−$1,240</strong></div>
        <div className="tpm-tag">Cost of goods</div>
        <p className="tpm-q">Business or personal?</p>
        <div className="tpm-actions"><span className="tpm-btn on">Business</span><span className="tpm-btn">Personal</span></div>
      </div>
      <div className="tpm-sent">✓ Saved — I'll remember this next time.</div>
    </div>
  ) : (
    <div className="tp-mock tp-mock-cpa">
      <div className="tpm-head"><strong>Client books · April</strong><span className="tpm-pill">CPA-ready</span></div>
      <div className="tpm-grid">
        <div className="tpm-cell"><span>Income categorized</span><strong>100%</strong></div>
        <div className="tpm-cell"><span>Expenses categorized</span><strong>100%</strong></div>
        <div className="tpm-cell"><span>Receipts matched</span><strong>96%</strong></div>
        <div className="tpm-cell"><span>Export</span><strong>QBO · Xero</strong></div>
      </div>
      <div className="tpm-sent">✓ Reviewed &amp; queued for your approval.</div>
    </div>
  );
}
