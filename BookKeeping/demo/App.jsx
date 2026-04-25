/**
 * App.jsx — root component. Owns routing + demo state.
 *
 * Routing is hash-based so the demo can be hosted at any static URL
 * (GitHub Pages, a sub-path, a preview deploy) without rewrites.
 *
 * Demo state is persisted to sessionStorage — scoped to the browser tab.
 * Closing the tab or opening a new one starts a fresh session, which is
 * the correct demo behaviour (every visitor sees the first-time experience).
 * Refreshing mid-walkthrough still works because sessionStorage survives reloads.
 * AI response cache (penny.cache.v1.*) stays in localStorage — no reason to
 * re-fetch those between sessions.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import OnboardingScreen from "./screens/onboarding.jsx";
import ThreadScreen from "./screens/thread.jsx";
import CardScreen from "./screens/card.jsx";
import AddScreen from "./screens/add.jsx";
import BooksScreen from "./screens/books.jsx";
import AvatarMenuScreen from "./screens/avatar-menu.jsx";
import InvoiceScreen from "./screens/invoice.jsx";
import TabBar from "./components/TabBar.jsx";
import { createClient } from "./worker-client.js";
import { scenarioKeyFor, DEFAULT_SCENARIO_KEY } from "./constants/variants.js";
import posthog from "posthog-js";

const STATE_KEY = "penny-demo-state-v5";
// Read base from the runtime config injected by index.html — avoids Vite's
// static BASE_URL replacement which always compiles to "/" in dev mode.
const BASE_URL      = window.PENNY_CONFIG?.baseUrl || "/";
const SCENARIOS_URL = `${BASE_URL}config/scenarios.json`;
const PERSONAS_URL  = `${BASE_URL}config/personas.json`;

function usePhoneScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    function compute() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const s = Math.min(1, (vh - 32) / 760, vw / 423);
      setScale(Math.max(0.55, parseFloat(s.toFixed(3))));
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return scale;
}

const DEFAULT_STATE = {
  onboardingComplete: false,
  persona: null,        // { name, business, entity, industry } — set after onboarding
  tab: "penny",         // penny | add | books
  overlay: null,        // null | "avatar-menu" | "invoice" | "card:<id>"

  // CPA collaboration state — see implementation/cpa-data-model.md for full schema.
  // All mutations go through util/cpaState.js — never write directly to this object.
  cpa: {
    account:   null,   // CPA account if current user is a CPA; null for founders
    invites:   [],     // outbound invite records the founder has generated
    clients:   {},     // CPA-side: map of clientId → client data
    approvals: {},     // shared: map of approvalId → approval record
    archives:  {},     // founder-side: map of cpaId → archived metadata on revocation
  },

  preferences: {
    notifyCpaActivity: "real-time", // "real-time" | "daily-digest" | "off"
  },
};

function readState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    // Deep-merge nested objects so new default keys reach returning users.
    // Top-level spread only would wholesale-replace `cpa` or `preferences`,
    // dropping any new keys added to DEFAULT_STATE after the user first ran the demo.
    return {
      ...DEFAULT_STATE,
      ...parsed,
      cpa: {
        ...DEFAULT_STATE.cpa,
        ...(parsed.cpa || {}),
      },
      preferences: {
        ...DEFAULT_STATE.preferences,
        ...(parsed.preferences || {}),
      },
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(state) {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota or private mode — demo still works, just not persistent.
  }
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#\/?/, "") || "";
  const [path, query] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { parts, query: query || "" };
}

export default function App() {
  const [state, setState] = useState(readState);
  const [route, setRoute] = useState(parseRoute);
  const [scenario, setScenario] = useState(null);
  const scale = usePhoneScale();

  // One AI client for the whole app. Reads runtime config injected by
  // index.html so the Worker URL / demo token / model names can change
  // without source edits. Screens call ai.renderPenny({ intent, context }).
  const ai = useMemo(() => createClient(window.PENNY_CONFIG || {}), []);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Sync state.cpa when the CPA app (running in an adjacent browser tab)
  // writes to the shared localStorage key. Without this, a CPA approval or
  // reclassification written in one tab would not appear in the founder's
  // Needs a look until the founder manually refreshes.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STATE_KEY || !e.newValue) return;
      try {
        const incoming = JSON.parse(e.newValue);
        if (incoming?.cpa) {
          setState((prev) => ({
            ...prev,
            cpa: {
              ...DEFAULT_STATE.cpa,
              ...prev.cpa,
              ...incoming.cpa,
            },
          }));
        }
      } catch {
        // Malformed storage entry — ignore.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    writeState(state);
  }, [state]);

  // Identify the user once their name and business are known (after intro conversation).
  useEffect(() => {
    const { firstName, business, entity, industry } = state.persona || {};
    if (firstName && business) {
      posthog.identify(posthog.get_distinct_id(), {
        $name: firstName,
        business,
        entity_type: entity,
        industry,
      });
    }
  }, [state.persona?.firstName, state.persona?.business]);

  // Load scenario + merge persona attributes once when persona is set, share across all screens.
  useEffect(() => {
    const { entity, industry } = state.persona || {};
    if (!entity) { setScenario(null); return; }
    const key = scenarioKeyFor(entity, industry);
    let cancelled = false;
    Promise.all([
      fetch(SCENARIOS_URL).then((r) => r.json()),
      fetch(PERSONAS_URL).then((r) => r.json()).catch(() => null),
    ]).then(([scenarioJson, personasJson]) => {
      if (cancelled) return;
      const s = scenarioJson.scenarios?.[key] || scenarioJson.scenarios?.[DEFAULT_SCENARIO_KEY] || {};
      setScenario(s);
      // Merge rich persona attributes (voiceContext, commonClients, monthlyRevenue, etc.)
      // into state.persona so AI prompts can use them without re-fetching.
      if (personasJson?.personas) {
        const dotKey = `${entity}.${industry}`;
        const personaData = personasJson.personas.find((p) => p.key === dotKey);
        if (personaData) {
          setState((prev) => ({
            ...prev,
            persona: {
              ...prev.persona,
              voiceContext:    personaData.voiceContext    ?? prev.persona?.voiceContext,
              commonClients:   personaData.commonClients   ?? prev.persona?.commonClients,
              monthlyRevenue:  personaData.monthlyRevenue  ?? prev.persona?.monthlyRevenue,
              monthlyExpenses: personaData.monthlyExpenses ?? prev.persona?.monthlyExpenses,
              primaryBank:     personaData.primaryBank     ?? prev.persona?.primaryBank,
            },
          }));
        }
      }
    }).catch(() => {
      if (!cancelled) setScenario((prev) => prev ?? {});
    });
    return () => { cancelled = true; };
  }, [state.persona?.entity, state.persona?.industry]);

  const set = useCallback((patch) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const navigate = useCallback((hash) => {
    window.location.hash = hash;
  }, []);

  const { parts } = route;

  const scaleStyle = {
    transform: scale < 1 ? `scale(${scale})` : undefined,
    transformOrigin: "center center",
  };

  // Onboarding is the forced entry point until it's complete.
  if (!state.onboardingComplete) {
    return (
      <div className="phone-stage">
        <div style={scaleStyle}>
          <OnboardingScreen ai={ai} state={state} set={set} navigate={navigate} />
        </div>
      </div>
    );
  }

  // Screen decisions by route prefix.
  const top = parts[0] || "penny";

  const screenProps = { ai, state, set, navigate, route, scenario };

  let main;
  if (top === "penny") {
    main = <ThreadScreen {...screenProps} />;
  } else if (top === "add") {
    main = <AddScreen {...screenProps} />;
  } else if (top === "books") {
    main = <BooksScreen {...screenProps} />;
  } else if (top === "card") {
    main = <CardScreen {...screenProps} />;
  } else if (top === "invoice") {
    main = <InvoiceScreen {...screenProps} />;
  } else if (top === "avatar") {
    main = <AvatarMenuScreen {...screenProps} />;
  } else {
    main = <ThreadScreen {...screenProps} />;
  }

  const tabVisible = ["penny", "add", "books"].includes(top);

  return (
    <div className="phone-stage">
      <div className="phone" style={scaleStyle}>
        {main}
        {tabVisible && <TabBar active={top} navigate={navigate} />}
        <div id="sheet-root" style={{ position: "absolute", inset: 0, zIndex: 199, pointerEvents: "none" }} />
      </div>
    </div>
  );
}
