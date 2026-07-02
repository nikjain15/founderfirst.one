/**
 * Accept an invite via ?token=. If not signed in, stash the token and bounce to
 * login (the user returns here after the magic link). Accepting is the only path
 * to access (ARCHITECTURE.md §5).
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getClient } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { SITE } from "@ff/site";
import { COPY } from "../copy";

const PENDING_KEY = "ff.pendingInvite";

export default function Accept() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const ran = useRef(false);
  const [msg, setMsg] = useState<string>(COPY.auth.accepting);

  useEffect(() => {
    if (loading || ran.current) return;
    if (!token) {
      setMsg(COPY.auth.inviteMissingToken);
      return;
    }
    if (!session) {
      localStorage.setItem(PENDING_KEY, token);
      nav("/login", { replace: true });
      return;
    }
    ran.current = true;
    void (async () => {
      const { data, error } = await getClient().functions.invoke("invites-accept", {
        body: { token },
      });
      if (error) {
        setMsg(COPY.auth.inviteFailed(SITE.email));
        return;
      }
      const orgId = (data as { org_id?: string } | null)?.org_id;
      if (orgId) localStorage.setItem("ff.activeOrg", orgId);
      localStorage.removeItem(PENDING_KEY);
      setMsg(COPY.auth.inviteAccepted);
      setTimeout(() => nav("/", { replace: true }), 700);
    })();
  }, [loading, session, token, nav]);

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brand" title={COPY.nav.brandTitle(SITE.company)}>
          <span className="p-mark p-mark-md" aria-hidden="true">P</span>
          {COPY.nav.penny}
        </div>
        <p className="muted" role="status" aria-live="polite">{msg}</p>
      </div>
    </main>
  );
}
