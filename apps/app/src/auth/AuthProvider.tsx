/**
 * Session-backed auth context. The role/tenant of the user is NEVER derived
 * here — it comes from the verified session + the active-org membership/engagement
 * (ARCHITECTURE.md §4). This provider only tracks "is there a session".
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getClient } from "../lib/supabase";
import { hasSupabase } from "../lib/env";
import { DEV_AUTO_LOGIN, devAutoSignIn } from "../lib/devAuth";

interface AuthState {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  session: null,
  loading: true,
  signOut: async () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabase) {
      setLoading(false);
      return;
    }
    const sb = getClient();
    void sb.auth
      .getSession()
      .then(async ({ data }) => {
        // E2E/dev only: if there's no session, auto-sign-in with the test account
        // (devAuth is a no-op + tree-shaken out of a normal prod build).
        if (!data.session && DEV_AUTO_LOGIN) { await devAutoSignIn(sb); return; }
        setSession(data.session);
      })
      // A rejected session fetch (network/storage failure) must still resolve
      // loading → unauthenticated, else the app hangs on "Loading…" forever.
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async (): Promise<void> => {
    if (hasSupabase) await getClient().auth.signOut();
  };

  return (
    <AuthCtx.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
