import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "@ff/design-system/tokens.css";
import "@ff/design-system/components/typography.css";
import "@ff/design-system/components/ff-mark.css";
import "@ff/design-system/components/button.css";
import "./styles.css";

import { App } from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("root element missing");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <App />
    </BrowserRouter>
  </StrictMode>,
);
