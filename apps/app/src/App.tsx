import { type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { ActiveOrgProvider } from "./org/ActiveOrgProvider";
import { AppErrorBoundary } from "./lib/ErrorBoundary";
import Login from "./routes/Login";
import Home from "./routes/Home";
import Accept from "./routes/Accept";
import StaffHome from "./staff/StaffHome";
import { useIsPlatformStaff } from "./staff/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// The staff console is its own top-level route (not org-scoped). The DB enforces
// staff-only access; this just picks the right view once we know the answer.
function StaffRoute() {
  const { data, isLoading, isError } = useIsPlatformStaff();
  if (isLoading) return <div className="center muted">Loading…</div>;
  // Don't conflate a failed access check with "not staff" — a transient RPC error
  // would otherwise wrongly show a real staff member the "Staff only" wall.
  if (isError) {
    return (
      <div className="empty" role="alert">
        <p className="empty-title">Couldn't verify access.</p>
        <p className="muted">We couldn't check your staff access just now.</p>
        <p><button type="button" onClick={() => window.location.reload()}>Try again</button></p>
      </div>
    );
  }
  return <StaffHome isStaff={Boolean(data)} />;
}

// Routes wrapped in an error boundary keyed by pathname, so a render crash in one
// view shows a recoverable message instead of blanking the SPA, and navigating
// away clears it.
function AppRoutes() {
  const location = useLocation();
  return (
    <AppErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/login" element={<Login />} />
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
          path="/"
          element={
            <RequireAuth>
              <ActiveOrgProvider>
                <Home />
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
