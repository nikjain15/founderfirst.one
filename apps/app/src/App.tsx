import { useEffect, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { ActiveOrgProvider } from "./org/ActiveOrgProvider";
import { AppErrorBoundary } from "./lib/ErrorBoundary";
import Login from "./routes/Login";
import Home from "./routes/Home";
import Settings from "./routes/Settings";
import Accept from "./routes/Accept";
import StaffHome from "./staff/StaffHome";
import AdminConsole from "./admin/AdminConsole";
import { adminRouteView } from "./admin/nav";
import { useIsPlatformStaff } from "./staff/api";
import { COPY } from "./copy";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

// Where to send the user back to after they sign in. Survives the magic-link round
// trip (a full page reload), which is why it lives in sessionStorage and not router
// state. Only one redirect is honored per stash — it's cleared on consume.
const RETURN_KEY = "ff.returnTo";

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const here = location.pathname + location.search;

  // Remember the protected page an unauthenticated user tried to reach, so we can
  // resume there after the magic link lands them back on "/" (F2).
  useEffect(() => {
    if (!loading && !session && here && here !== "/") {
      sessionStorage.setItem(RETURN_KEY, here);
    }
  }, [loading, session, here]);

  if (loading) return <div className="center muted">{COPY.common.loading}</div>;
  if (!session) return <Navigate to="/login" replace />;

  // Authenticated: if there's a pending return path and we're not already on it,
  // consume it once and go there.
  const returnTo = sessionStorage.getItem(RETURN_KEY);
  if (returnTo) {
    sessionStorage.removeItem(RETURN_KEY);
    if (returnTo !== here) return <Navigate to={returnTo} replace />;
  }
  return <>{children}</>;
}

// An already-signed-in user has no business on /login — bounce them to their
// pending return path, or home (F1).
function LoginRoute() {
  const { session, loading } = useAuth();
  if (loading) return <div className="center muted">{COPY.common.loading}</div>;
  if (session) {
    const returnTo = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return <Navigate to={returnTo && returnTo !== "/login" ? returnTo : "/"} replace />;
  }
  return <Login />;
}

// The staff console is its own top-level route (not org-scoped). The DB enforces
// staff-only access; this just picks the right view once we know the answer.
function StaffRoute() {
  const { data, isLoading, isError } = useIsPlatformStaff();
  if (isLoading) return <div className="center muted">{COPY.common.loading}</div>;
  // Don't conflate a failed access check with "not staff" — a transient RPC error
  // would otherwise wrongly show a real staff member the "Staff only" wall.
  if (isError) {
    return (
      <div className="empty" role="alert">
        <p className="empty-title">{COPY.errors.verifyAccessFailed}</p>
        <p className="muted">{COPY.errors.verifyAccessBody}</p>
        <p><button type="button" onClick={() => window.location.reload()}>{COPY.common.tryAgain}</button></p>
      </div>
    );
  }
  return <StaffHome isStaff={Boolean(data)} />;
}

// The internal admin console (IA-3, penny.founderfirst.one/admin) — its own
// top-level, staff-only route, gated by the SAME is_platform_staff() check as
// /staff. Additive parallel-run: founderfirst.one/admin stays live and
// authoritative. A transient access-check error must not read as "not staff".
function AdminRoute() {
  const { data, isLoading, isError } = useIsPlatformStaff();
  // Fail closed: never render the console until the check RESOLVES (adminRouteView).
  switch (adminRouteView({ isLoading, isError, isStaff: Boolean(data) })) {
    case "loading":
      return <div className="center muted">{COPY.common.loading}</div>;
    case "error":
      return (
        <div className="empty" role="alert">
          <p className="empty-title">{COPY.errors.verifyAccessFailed}</p>
          <p className="muted">{COPY.errors.verifyAccessBody}</p>
          <p><button type="button" onClick={() => window.location.reload()}>{COPY.common.tryAgain}</button></p>
        </div>
      );
    default:
      // "console" | "denied" — AdminConsole renders the shell or the Staff-only wall.
      return <AdminConsole isStaff={Boolean(data)} />;
  }
}

// Routes wrapped in an error boundary keyed by pathname, so a render crash in one
// view shows a recoverable message instead of blanking the SPA, and navigating
// away clears it.
function AppRoutes() {
  const location = useLocation();
  return (
    <AppErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/accept" element={<Accept />} />
        <Route
          path="/staff"
          element={
            <RequireAuth>
              <StaffRoute />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminRoute />
            </RequireAuth>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <ActiveOrgProvider>
                <Home />
              </ActiveOrgProvider>
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <ActiveOrgProvider>
                <Settings />
              </ActiveOrgProvider>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppErrorBoundary>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* basename follows the build base (Vite BASE_URL). The app's single home
            is penny.founderfirst.one (base "/"); founderfirst.one/app/* now just
            redirects there. The base-aware basename is kept so a legacy "/app/"
            build would still route correctly. */}
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
