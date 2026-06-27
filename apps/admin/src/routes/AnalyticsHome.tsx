import { useState } from "react";
import { AnalyticsSupport } from "./Analytics";
import { AnalyticsWaitlist } from "./AnalyticsWaitlist";
import { AnalyticsProduct } from "./AnalyticsProduct";
import { AnalyticsMarketing } from "./AnalyticsMarketing";
import { AnalyticsSignals } from "./AnalyticsSignals";
import { AnalyticsPostHog } from "./AnalyticsPostHog";
import { AnalyticsInsights } from "./AnalyticsInsights";

type Tab = "acquisition" | "product" | "support" | "signals";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "acquisition", label: "Acquisition" },
  { id: "product",     label: "Product"     },
  { id: "support",     label: "Support"     },
  { id: "signals",     label: "Signals"     },
];

// Old per-source hashes still deep-link here — fold them into the merged tabs so
// existing bookmarks and the back-compat redirects keep working.
const HASH_ALIASES: Record<string, Tab> = {
  waitlist:  "acquisition",
  marketing: "acquisition",
  posthog:   "product",
  insights:  "product",
};

function resolveTab(hash: string): Tab {
  if (TABS.some((t) => t.id === hash)) return hash as Tab;
  return HASH_ALIASES[hash] ?? "acquisition";
}

/** A labelled block grouping one source's report inside a merged tab. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="analytics-section">
      <div className="eyebrow analytics-section-label">{label}</div>
      {children}
    </section>
  );
}

export function AnalyticsHome() {
  const [tab, setTab] = useState<Tab>(() =>
    resolveTab(typeof window !== "undefined" ? window.location.hash.slice(1) : "")
  );

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
            type="button"
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="analytics-tabpanel"
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTabAndHash(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel" role="tabpanel" id="analytics-tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "acquisition" && (
          <>
            <Section label="Waitlist"><AnalyticsWaitlist /></Section>
            <Section label="Traffic · GA4"><AnalyticsMarketing /></Section>
          </>
        )}
        {tab === "product" && (
          <>
            <Section label="Activation funnel"><AnalyticsProduct /></Section>
            <Section label="Usage · PostHog"><AnalyticsPostHog /></Section>
            <Section label="Insights"><AnalyticsInsights /></Section>
          </>
        )}
        {tab === "support" && <AnalyticsSupport />}
        {tab === "signals" && <AnalyticsSignals />}
      </div>
    </div>
  );
}
