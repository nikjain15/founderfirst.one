import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import { getClient } from "./lib/supabase";
import { hasSupabase } from "./lib/env";
import { IconLogOut } from "./lib/icons";
import { Login } from "./routes/Login";
import { Inbox } from "./routes/Inbox";
import { TicketDetail } from "./routes/TicketDetail";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (!hasSupabase) {
      setLoading(false);
      return;
    }
    const db = getClient();
    db.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = db.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
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
      <nav className="admin-nav">
        <div className="wrap nav-inner">
          <Link to="/support" className="brand">
            <span className="ff-mark ff-mark-md">FF</span>
            Admin
          </Link>
          <div className="nav-meta">
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
            element={signedIn ? <Navigate to="/support" replace /> : <Login />}
          />
          <Route
            path="/support"
            element={signedIn ? <Inbox /> : <Navigate to="/login" replace state={{ from: location }} />}
          />
          <Route
            path="/support/:ticketId"
            element={signedIn ? <TicketDetail /> : <Navigate to="/login" replace state={{ from: location }} />}
          />
        </Routes>
      </main>
    </div>
  );
}
