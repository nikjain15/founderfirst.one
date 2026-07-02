/**
 * Magic-link login (same primitive as admin). Accepting the email link returns
 * the user to /app/ with a session; routing + active-org selection take over there.
 */
import { useState, type FormEvent } from "react";
import { getClient } from "../lib/supabase";
import { hasSupabase } from "../lib/env";
import { SITE } from "@ff/site";
import { COPY } from "../copy";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!hasSupabase) {
      setError(COPY.auth.notConfigured);
      return;
    }
    setBusy(true);
    setError(null);
    // Trim stray whitespace — a leading/trailing space otherwise sends to an
    // address that never receives the link, with no feedback to the user.
    const { error: err } = await getClient().auth.signInWithOtp({
      email: email.trim(),
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
        <div className="brand" title={COPY.nav.brandTitle(SITE.company)}>
          <span className="p-mark p-mark-md" aria-hidden="true">P</span>
          {COPY.nav.penny}
        </div>
        {sent ? (
          <p className="muted">
            {COPY.auth.checkEmail(email).before}<strong>{email}</strong>{COPY.auth.checkEmail(email).after}
          </p>
        ) : (
          <form onSubmit={submit}>
            <h1>{COPY.auth.signIn}</h1>
            <p className="muted">{COPY.auth.signInLead}</p>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              aria-label={COPY.auth.emailAria}
              placeholder={COPY.auth.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={busy || !email}>
              {busy ? COPY.auth.sending : COPY.auth.emailMeLink}
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
