/**
 * main.jsx — React entry point for the Penny demo.
 *
 * Wires React 18 to the root element in index.html. All routing, state,
 * and screen mounting lives in <App />.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles/tokens.css";
import "./styles/components.css";
import "./util/analytics.js";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
