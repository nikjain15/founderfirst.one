import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@ff/design-system/tokens.css";
import "@ff/design-system/components/reset.css";
import "@ff/design-system/components/typography.css";
import "@ff/design-system/components/ff-mark.css";
import "@ff/design-system/components/p-mark.css";
import "@ff/design-system/components/button.css";
import "./styles.css";

import { App } from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("root element missing");

// One shared query cache for the whole admin app. Sensible defaults: data is
// considered fresh for 30s (no refetch storms on remount), retry once on error.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/admin">
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
