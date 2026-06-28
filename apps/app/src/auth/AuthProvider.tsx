/**
 * Session-backed auth context. The role/tenant of the user is NEVER derived
 * here — it comes from the verified session + the active-org membership/engagement
 * (ARCHITECTURE.md §4). This provider only tracks "is there a session".
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getClient } from "../lib/supabase";
import { hasSupabase } from "../lib/env";

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
    void sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
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
