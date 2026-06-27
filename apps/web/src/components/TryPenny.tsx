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
          <div className="screen"><Demo src="/penny/demo/businessowner/" title="Penny — business-owner view" mode="owner" /></div>
        </div>
      ) : (
        <div className="browser">
          <div className="bar"><span/><span/><span/><em>penny.app/cpa</em></div>
          <div className="screen"><Demo src="/penny/demo/cpa/" title="Penny — CPA view" mode="cpa" /></div>
        </div>
      )}

      <div className="tp-cta">
        <a
          className="tp-launch"
          href={view === "owner" ? "/penny/demo/businessowner/" : "/penny/demo/cpa/"}
          target="_blank"
          rel="noopener"
        >
          Open the full {view === "owner" ? "business-owner" : "CPA"} demo →
        </a>
        <span className="tp-cta-note">Opens the real interactive demo — click through it yourself.</span>
      </div>
    </div>
  );
}

// In production the live Penny demo (deployed at /penny/demo/*) embeds here —
// the phone shows the mobile business-owner app, the browser shows the web CPA
// console. In dev those paths 404, so render an on-brand mock of each instead so
// the section never looks empty or broken.
function Demo({ src, title, mode }: { src: string; title: string; mode: "owner" | "cpa" }) {
  if (import.meta.env.PROD) return <iframe src={src} title={title} loading="lazy" />;
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
