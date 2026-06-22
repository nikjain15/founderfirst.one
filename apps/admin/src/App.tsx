import { Suspense, lazy, useEffect, useRef, useState, type ReactElement } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import { getClient, isAdmin, logAudit } from "./lib/supabase";
import { hasSupabase } from "./lib/env";
import { IconLogOut, IconMenu, IconClose, IconSettings, IconChevronDown } from "./lib/icons";
import { Login } from "./routes/Login";

// Authenticated routes are code-split: each loads on demand so the initial
// bundle stays small. Login stays eager — it's the unauthenticated entry point.
const named = <K extends string>(p: Promise<Record<K, React.ComponentType<any>>>, key: K) =>
  p.then((m) => ({ default: m[key] }));
const Inbox         = lazy(() => named(import("./routes/Inbox"), "Inbox"));
const TicketDetail  = lazy(() => named(import("./routes/TicketDetail"), "TicketDetail"));
const AnalyticsHome = lazy(() => named(import("./routes/AnalyticsHome"), "AnalyticsHome"));
const AudienceHome  = lazy(() => named(import("./routes/AudienceHome"), "AudienceHome"));
const Audit         = lazy(() => named(import("./routes/Audit"), "Audit"));
const Admins        = lazy(() => named(import("./routes/Admins"), "Admins"));
const ContentHome   = lazy(() => named(import("./routes/ContentHome"), "ContentHome"));
const HowItWorks    = lazy(() => named(import("./routes/HowItWorks"), "HowItWorks"));

/** Gate a route behind sign-in; bounce to /login (remembering where we came from). */
function RequireAuth({ signedIn, children }: { signedIn: boolean; children: ReactElement }) {
  const location = useLocation();
  return signedIn ? children : <Navigate to="/login" replace state={{ from: location }} />;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const location = useLocation();
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setNavOpen(false); setSettingsOpen(false); }, [location.pathname]);

  // Dismiss the settings dropdown on outside-click or Escape.
  useEffect(() => {
    if (!settingsOpen) return;
    function onPointer(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!hasSupabase) {
      setLoading(false);
      return;
    }
    const db = getClient();
    db.auth.getSession().then(async ({ data }) => {
      const s = data.session ?? null;
      if (s) {
        const ok = await isAdmin(s.user.email ?? "").catch(() => false);
        if (!ok) {
          setDenied(true);
          await db.auth.signOut();
          setSession(null);
        } else {
          setSession(s);
        }
      }
      setLoading(false);
    });
    // Supabase fires SIGNED_IN on every page load (rehydrate) and on token refresh —
    // not only on actual sign-in. Dedupe per browser session via sessionStorage so
    // we record one row per real login. Also avoids double-fire from React StrictMode.
    const LOGGED_KEY = "ff_admin_auth_logged";
    const { data: sub } = db.auth.onAuthStateChange((event, s) => {
      setSession(s ?? null);
      if (event === "SIGNED_IN" && s) {
        const email = s.user.email ?? "";
        // Gate: confirm the signed-in email is in the admins allow-list.
        // If not, sign them out immediately and show a denial screen.
        void isAdmin(email).then((ok) => {
          if (!ok) {
            setDenied(true);
            void db.auth.signOut();
            return;
          }
          setDenied(false);
          const uid = s.user.id;
          if (sessionStorage.getItem(LOGGED_KEY) !== uid) {
            sessionStorage.setItem(LOGGED_KEY, uid);
            void logAudit("auth.sign_in", "auth", email, {});
          }
        });
      }
      if (event === "SIGNED_OUT") {
        sessionStorage.removeItem(LOGGED_KEY);
        void logAudit("auth.sign_out", "auth", null, {});
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="admin-shell" />;

  if (!hasSupabase) {
    return (
      <div className="admin-shell">
        <main className="admin-main">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · config</div>
          <h1 className="page-title">Missing keys.</h1>
          <p className="page-sub">
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{" "}
            <code>apps/admin/.env.local</code>, then restart the dev server.
          </p>
        </main>
      </div>
    );
  }

  const signedIn = !!session;

  return (
    <div className="admin-shell">
      <nav className={`admin-nav ${signedIn ? "signed-in" : ""} ${navOpen ? "is-open" : ""}`}>
        <div className="wrap nav-inner">
          <Link to="/support" className="brand">
            <span className="ff-mark ff-mark-md">FF</span>
            Admin
          </Link>
          {signedIn && (
            <button
              type="button"
              className="nav-toggle"
              aria-label={navOpen ? "Close menu" : "Open menu"}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              {navOpen ? <IconClose size={18} /> : <IconMenu size={18} />}
            </button>
          )}
          <div className="nav-meta">
            {signedIn && (
              <div className="nav-links">
                <Link to="/support" className={location.pathname.startsWith("/support") ? "active" : ""}>Support</Link>
                <Link to="/audience" className={location.pathname.startsWith("/audience") ? "active" : ""}>Audience</Link>
                <Link to="/analytics" className={location.pathname.startsWith("/analytics") ? "active" : ""}>Analytics</Link>
                <Link to="/content" className={location.pathname.startsWith("/content") ? "active" : ""}>Penny</Link>
              </div>
            )}
            {signedIn ? (
              <>
                <div ref={settingsRef} className={`settings-menu ${settingsOpen ? "is-open" : ""}`}>
                  <button
                    type="button"
                    className={`settings-trigger ${location.pathname.startsWith("/audit") || location.pathname.startsWith("/admins") || location.pathname.startsWith("/how-it-works") ? "active" : ""}`}
                    aria-haspopup="menu"
                    aria-expanded={settingsOpen}
                    aria-label="Settings"
                    onClick={() => setSettingsOpen((v) => !v)}
                  >
                    <IconSettings size={15} />
                    <IconChevronDown size={13} />
                  </button>
                  <div className="settings-dropdown" role="menu">
                    <span className="settings-email">{session?.user.email}</span>
                    <Link to="/admins" role="menuitem" className={location.pathname.startsWith("/admins") ? "active" : ""}>Admins</Link>
                    <Link to="/audit" role="menuitem" className={location.pathname.startsWith("/audit") ? "active" : ""}>Audit log</Link>
                    <Link to="/how-it-works" role="menuitem" className={location.pathname.startsWith("/how-it-works") ? "active" : ""}>How it works</Link>
                    <button type="button" role="menuitem" onClick={() => getClient().auth.signOut()}>
                      <IconLogOut size={14} />
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <Link to="/login">Sign in</Link>
            )}
          </div>
        </div>
      </nav>

      <main className="admin-main">
        <Suspense fallback={<div className="empty">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/support" replace />} />
            <Route
              path="/login"
              element={signedIn ? <Navigate to="/support" replace /> : (
                denied ? (
                  <div className="login-wrap">
                    <div className="login-card">
                      <span className="ff-mark ff-mark-md">FF</span>
                      <div className="eyebrow">Admin · access</div>
                      <h1>Not authorized.</h1>
                      <p className="sub">Your email isn't on the admin list. Contact the super admin to request access.</p>
                      <button className="btn" onClick={() => setDenied(false)}>Try a different email</button>
                    </div>
                  </div>
                ) : <Login />
              )}
            />
            <Route path="/support" element={<RequireAuth signedIn={signedIn}><Inbox /></RequireAuth>} />
            <Route path="/support/:ticketId" element={<RequireAuth signedIn={signedIn}><TicketDetail /></RequireAuth>} />
            <Route path="/audience" element={<RequireAuth signedIn={signedIn}><AudienceHome /></RequireAuth>} />
            <Route path="/analytics" element={<RequireAuth signedIn={signedIn}><AnalyticsHome /></RequireAuth>} />
            <Route path="/content" element={<RequireAuth signedIn={signedIn}><ContentHome /></RequireAuth>} />
            <Route path="/audit" element={<RequireAuth signedIn={signedIn}><Audit /></RequireAuth>} />
            <Route path="/how-it-works" element={<RequireAuth signedIn={signedIn}><HowItWorks currentEmail={session?.user.email ?? ""} /></RequireAuth>} />
            {/* Back-compat redirects — old top-level tabs now live under Audience. */}
            <Route path="/users" element={<Navigate to="/audience#web" replace />} />
            <Route path="/signals" element={<Navigate to="/audience#signals" replace />} />
            <Route path="/discord" element={<Navigate to="/audience#discord" replace />} />
            <Route
              path="/admins"
              element={<RequireAuth signedIn={signedIn}><Admins currentEmail={session?.user.email ?? ""} /></RequireAuth>}
            />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
