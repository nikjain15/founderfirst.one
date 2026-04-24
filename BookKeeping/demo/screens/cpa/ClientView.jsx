/**
 * screens/cpa/ClientView.jsx — per-client content pane (tab router).
 *
 * Owns the content area only (flex: 1, overflow: hidden).
 * Sidebar and bottom nav remain in App.jsx.
 * Renders the active tab component based on activeTab prop.
 */

import React from "react";
import WorkQueue from "./WorkQueue.jsx";
import Books from "./Books.jsx";
import ProfitLoss from "./ProfitLoss.jsx";
import CashFlow from "./CashFlow.jsx";
import LearnedRules from "./LearnedRules.jsx";

function Placeholder({ label }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ink-4)",
        fontSize: "var(--fs-body)",
        fontFamily: "var(--font-sans)",
        padding: 40,
        textAlign: "center",
      }}
    >
      {label}
    </div>
  );
}

export default function ClientView({
  clientId,
  clients,
  approvals,
  activeTab,
  cpaAccount,
  onUpdateCpa,
}) {
  const clientData = clients?.[clientId];

  // Common props passed to all tabs
  const tabProps = {
    clientId,
    clientData,
    approvals: approvals || {},
    cpaAccount,
    onUpdateCpa,
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {activeTab === "work-queue"    && <WorkQueue    {...tabProps} />}
      {activeTab === "books"         && <Books        {...tabProps} />}
      {activeTab === "pl"            && <ProfitLoss   {...tabProps} />}
      {activeTab === "cash-flow"     && <CashFlow     {...tabProps} />}
      {activeTab === "chat"          && <Placeholder label="Chat — coming in Step 8" />}
      {activeTab === "learned-rules" && <LearnedRules {...tabProps} />}
    </div>
  );
}
