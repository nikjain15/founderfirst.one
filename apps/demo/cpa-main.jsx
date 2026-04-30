/**
 * cpa-main.jsx — React entry point for the Penny CPA app.
 *
 * Mounts screens/cpa/App.jsx into #cpa-root (defined in cpa/index.html).
 * Shares the same token/component CSS as the founder app.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import CPAApp from "./screens/cpa/App.jsx";
import "./styles/tokens.css";
import "./styles/components.css";
import "./util/analytics.js";

const root = document.getElementById("cpa-root");
if (!root) {
  throw new Error("Root element #cpa-root not found in cpa/index.html");
}

createRoot(root).render(
  <React.StrictMode>
    <CPAApp />
  </React.StrictMode>
);
