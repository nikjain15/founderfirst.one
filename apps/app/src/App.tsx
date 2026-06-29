import { type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { ActiveOrgProvider } from "./org/ActiveOrgProvider";
import Login from "./routes/Login";
import Home from "./routes/Home";
import Accept from "./routes/Accept";

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* basename follows the build base (Vite BASE_URL): "/app/" for the
            GitHub-Pages build at founderfirst.one/app/, "/" for the root-hosted
            Cloudflare-Pages build at penny.founderfirst.one. */}
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/accept" element={<Accept />} />
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
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
