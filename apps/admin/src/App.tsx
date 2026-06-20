import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import { getClient, isAdmin, logAudit } from "./lib/supabase";
import { hasSupabase } from "./lib/env";
import { IconLogOut, IconMenu, IconClose } from "./lib/icons";
import { Login } from "./routes/Login";
import { Inbox } from "./routes/Inbox";
import { TicketDetail } from "./routes/TicketDetail";
import { AnalyticsHome } from "./routes/AnalyticsHome";
import { Users } from "./routes/Users";
import { Audit } from "./routes/Audit";
import { Admins } from "./routes/Admins";
import { ContentHome } from "./routes/ContentHome";
import { DiscordLinks } from "./routes/DiscordLinks";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const location = useLocation();

  useEffect(() => { setNavOpen(false); }, [location.pathname]);

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
                <Link to="/users" className={location.pathname.startsWith("/users") ? "active" : ""}>Users</Link>
                <Link to="/analytics" className={location.pathname.startsWith("/analytics") ? "active" : ""}>Analytics</Link>
                <Link to="/content" className={location.pathname.startsWith("/content") ? "active" : ""}>Content</Link>
                <Link to="/audit" className={location.pathname.startsWith("/audit") ? "active" : ""}>Audit</Link>
                <Link to="/discord" className={location.pathname.startsWith("/discord") ? "active" : ""}>Discord</Link>
                <Link to="/admins" className={location.pathname.startsWith("/admins") ? "active" : ""}>Admins</Link>
              </div>
            )}
            {signedIn ? (
              <>
                <span className="nav-email">{session?.user.email}</span>
                <button onClick={() => getClient().auth.signOut()} aria-label="Sign out">
                  <IconLogOut size={14} />
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login">Sign in</Link>
            )}
          </div>
        </div>
      </nav>

      <main className="admin-main">
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
          <Route
            path="/support"
            element={signedIn ? <Inbox /> : <Navigate to="/login" replace state={{ from: location }} />}
          />
          <Route
            path="/support/:ticketId"
            element={signedIn ? <TicketDetail /> : <Navigate to="/login" replace state={{ from: location }} />}
          />
          <Route
            path="/users"
            element={signedIn ? <Users /> : <Navigate to="/login" replace state={{ from: location }} />}
          />
          <Route
            path="/analytics"
            element={signedIn ? <AnalyticsHome /> : <Navigate to="/login" replace state={{ from: location }} />}
          />
          <Route
            path="/content"
            element={signedIn ? <ContentHome /> : <Navigate to="/login" replace state={{ from: location }} />}
          />
          <Route
            path="/audit"
            element={signedIn ? <Audit /> : <Navigate to="/login" replace state={{ from: location }} />}
          />
          <Route
            path="/discord"
            element={signedIn ? <DiscordLinks /> : <Navigate to="/login" replace state={{ from: location }} />}
          />
          <Route
            path="/admins"
            element={signedIn ? <Admins currentEmail={session?.user.email ?? ""} /> : <Navigate to="/login" replace state={{ from: location }} />}
          />
        </Routes>
      </main>
    </div>
  );
}
