/**
 * Audience — one home for everyone in FounderFirst's orbit.
 *
 * Web (waitlist signups) and Discord are people who came to us; Signals is the
 * outbound side — people worth reaching. Merging the old Users + Signals tabs
 * here keeps the top nav to four primary destinations.
 *
 * Sub-tab state is hash-backed (#web / #discord / #signals) so the old
 * /users and /signals deep links can redirect straight into the right tab.
 */
import { useState } from "react";
import { WebSignups } from "./Users";
import { DiscordLinks } from "./DiscordLinks";
import { Signals } from "./Signals";

type Tab = "web" | "discord" | "signals";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "web",     label: "Web signups" },
  { id: "discord", label: "Discord" },
  { id: "signals", label: "Signals" },
];

export function AudienceHome() {
  const [tab, setTab] = useState<Tab>(() => {
    const fromHash = (typeof window !== "undefined" ? window.location.hash.slice(1) : "") as Tab;
    return TABS.some((t) => t.id === fromHash) ? fromHash : "web";
  });

  function setTabAndHash(t: Tab) {
    setTab(t);
    if (typeof window !== "undefined") window.location.hash = t;
  }

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · audience</div>
      <h1 className="page-title">Your people.</h1>
      <p className="page-sub">
        Everyone who came to FounderFirst — and, in Signals, the people worth reaching next.
      </p>

      <div className="tabs" role="tablist" style={{ marginTop: 18, marginBottom: 18 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="audience-tabpanel"
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTabAndHash(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel" role="tabpanel" id="audience-tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "web"     && <WebSignups />}
        {tab === "discord" && <DiscordLinks embedded />}
        {tab === "signals" && <Signals embedded />}
      </div>
    </div>
  );
}
