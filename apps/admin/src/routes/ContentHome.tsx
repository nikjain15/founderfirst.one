import { useState } from "react";
import { ContentPrompt } from "./ContentPrompt";

type Tab = "prompt" | "kb";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "prompt", label: "Prompt" },
  { id: "kb",     label: "Knowledge base" },
];

export function ContentHome() {
  const [tab, setTab] = useState<Tab>(() => {
    const fromHash = (typeof window !== "undefined" ? window.location.hash.slice(1) : "") as Tab;
    return TABS.some((t) => t.id === fromHash) ? fromHash : "prompt";
  });

  function setTabAndHash(t: Tab) {
    setTab(t);
    if (typeof window !== "undefined") window.location.hash = t;
  }

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · content</div>
      <h1 className="page-title">Penny's brain.</h1>
      <p className="page-sub">Edit the system prompt and manage the knowledge base Penny reads from.</p>

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
        {tab === "prompt" && <ContentPrompt />}
        {tab === "kb"     && <KbComingSoon />}
      </div>
    </div>
  );
}

function KbComingSoon() {
  return (
    <div className="empty">
      <p className="empty-title">Knowledge base — coming in Phase 2.</p>
      <p>Once enabled, Penny will retrieve top-matching snippets per user message using vector search.</p>
    </div>
  );
}
