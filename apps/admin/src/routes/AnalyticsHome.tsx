import { useState } from "react";
import { AnalyticsSupport } from "./Analytics";
import { AnalyticsWaitlist } from "./AnalyticsWaitlist";
import { AnalyticsProduct } from "./AnalyticsProduct";
import { AnalyticsMarketing } from "./AnalyticsMarketing";
import { AnalyticsSignals } from "./AnalyticsSignals";

type Tab = "waitlist" | "product" | "marketing" | "support" | "signals";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "waitlist",  label: "Waitlist"  },
  { id: "product",   label: "Product"   },
  { id: "marketing", label: "Marketing" },
  { id: "support",   label: "Support"   },
  { id: "signals",   label: "Signals"   },
];

export function AnalyticsHome() {
  const [tab, setTab] = useState<Tab>(() => {
    const fromHash = (typeof window !== "undefined" ? window.location.hash.slice(1) : "") as Tab;
    return TABS.some((t) => t.id === fromHash) ? fromHash : "waitlist";
  });

  function setTabAndHash(t: Tab) {
    setTab(t);
    if (typeof window !== "undefined") window.location.hash = t;
  }

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · analytics</div>
      <h1 className="page-title">The numbers that matter.</h1>
      <p className="page-sub">Signups, product usage, traffic, support — all in one place.</p>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTabAndHash(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {tab === "waitlist"  && <AnalyticsWaitlist />}
        {tab === "product"   && <AnalyticsProduct />}
        {tab === "marketing" && <AnalyticsMarketing />}
        {tab === "support"   && <AnalyticsSupport />}
        {tab === "signals"   && <AnalyticsSignals />}
      </div>
    </div>
  );
}
