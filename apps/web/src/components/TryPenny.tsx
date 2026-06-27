import { useEffect, useState } from "react";

/**
 * Try Penny — interactive demo. Business-owner ↔ CPA toggle swaps a phone frame
 * (mobile app) for a browser frame (web console). The framed preview is a teaser;
 * "Try it live" opens the real demo full-screen in an in-page lightbox so users
 * get the whole product without leaving the page.
 */
type View = "owner" | "cpa";

const DEMO: Record<View, { src: string; label: string }> = {
  owner: { src: "/penny/demo/businessowner/", label: "business-owner" },
  cpa: { src: "/penny/demo/cpa/", label: "CPA" },
};

export default function TryPenny({ ownerSub, cpaSub }: { ownerSub: string; cpaSub: string }) {
  const [view, setView] = useState<View>("owner");
  const [live, setLive] = useState(false);

  // Lightbox: lock body scroll + close on Escape.
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLive(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [live]);

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
        <button className="tp-frame phone" onClick={() => setLive(true)} aria-label="Try the business-owner demo live">
          <div className="notch" />
          <div className="screen"><Demo mode="owner" /></div>
          <span className="tp-play"><span className="tp-play-ic">▶</span> Try it live</span>
        </button>
      ) : (
        <button className="tp-frame browser" onClick={() => setLive(true)} aria-label="Try the CPA demo live">
          <div className="bar"><span/><span/><span/><em>penny.app/cpa</em></div>
          <div className="screen"><Demo mode="cpa" /></div>
          <span className="tp-play"><span className="tp-play-ic">▶</span> Try it live</span>
        </button>
      )}

      <div className="tp-cta">
        <button className="tp-launch" onClick={() => setLive(true)}>
          Try the full {DEMO[view].label} demo →
        </button>
        <span className="tp-cta-note">Opens the real interactive demo — click through it yourself.</span>
      </div>

      {live && (
        <div className="tp-lightbox" role="dialog" aria-modal="true" aria-label={`Penny ${DEMO[view].label} demo`} onClick={() => setLive(false)}>
          <div className={`tp-lb-stage ${view}`} onClick={(e) => e.stopPropagation()}>
            <div className="tp-lb-bar">
              <span className="tp-lb-title"><span className="tp-lb-dot" /> Penny — {DEMO[view].label} demo</span>
              <div className="tp-lb-actions">
                <a className="tp-lb-newtab" href={DEMO[view].src} target="_blank" rel="noopener">Open in new tab ↗</a>
                <button className="tp-lb-close" onClick={() => setLive(false)} aria-label="Close demo">✕</button>
              </div>
            </div>
            <iframe className="tp-lb-frame" src={DEMO[view].src} title={`Penny ${DEMO[view].label} demo`} loading="lazy" />
          </div>
        </div>
      )}
    </div>
  );
}

// Teaser preview inside the framed card. The real demo (deployed at
// /penny/demo/*) loads in the lightbox; here we show an on-brand mock so the
// teaser is never empty (and never 404s in dev).
function Demo({ mode }: { mode: View }) {
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
