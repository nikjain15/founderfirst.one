/**
 * Magic-link login (same primitive as admin). Accepting the email link returns
 * the user to /app/ with a session; routing + active-org selection take over there.
 */
import { useState, type FormEvent } from "react";
import { getClient } from "../lib/supabase";
import { hasSupabase } from "../lib/env";
import { SITE } from "@ff/site";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!hasSupabase) {
      setError("Sign-in isn't configured in this environment.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getClient().auth.signInWithOtp({
      email,
      // base-aware: "/app/" on founderfirst.one/app/, "/" on penny.founderfirst.one
      options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brand" title={`Penny by ${SITE.company}`}>
          <span className="p-mark p-mark-md" aria-hidden="true">P</span>
          Penny
        </div>
        {sent ? (
          <p className="muted">
            Check <strong>{email}</strong> for a sign-in link.
          </p>
        ) : (
          <form onSubmit={submit}>
            <h1>Sign in</h1>
            <p className="muted">Penny's keeping your books — sign in to pick up where you left off. We'll email you a one-time link.</p>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              aria-label="Email address"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={busy || !email}>
              {busy ? "Sending…" : "Email me a link"}
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
