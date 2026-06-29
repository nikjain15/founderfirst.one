import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@ff/design-system/tokens.css";
import "@ff/design-system/components/reset.css";
import "@ff/design-system/components/typography.css";
import "@ff/design-system/components/button.css";
import "@ff/design-system/components/ff-mark.css";
import "@ff/design-system/components/p-mark.css";
import "./styles.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
