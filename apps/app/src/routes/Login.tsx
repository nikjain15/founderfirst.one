/**
 * Magic-link login (same primitive as admin). Accepting the email link returns
 * the user to /app/ with a session; routing + active-org selection take over there.
 */
import { useState, type FormEvent } from "react";
import { getClient } from "../lib/supabase";
import { hasSupabase, hasTurnstile, TURNSTILE_SITE_KEY } from "../lib/env";
import { SITE } from "@ff/site";
import { COPY } from "../copy";
import { Turnstile } from "../auth/Turnstile";
import { canDispatchOtp } from "../auth/otpGate";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!hasSupabase) {
      setError(COPY.auth.notConfigured);
      return;
    }
    setBusy(true);
    setError(null);
    const client = getClient();
    // Trim stray whitespace — a leading/trailing space otherwise sends to an
    // address that never receives the link, with no feedback to the user.
    const trimmed = email.trim();

    // Server-side rate limit (card SEC-2) — checked before dispatch, independent
    // of Turnstile, so rapid-fire requests are refused even if bot-verified.
    const { data: rateLimitRaw, error: rateLimitErr } = await client.rpc(
      "check_and_record_otp_attempt",
      { p_email: trimmed },
    );
    if (rateLimitErr) {
      setBusy(false);
      setError(rateLimitErr.message);
      return;
    }
    const rateLimit = rateLimitRaw as { allowed: true } | { allowed: false; retry_after_seconds: number };

    const gate = canDispatchOtp({ hasTurnstile, captchaToken, rateLimit });
    if (!gate.ok) {
      setBusy(false);
      setError(gate.reason === "captcha_required" ? COPY.auth.captchaRequired : COPY.auth.rateLimited(gate.retryAfterSeconds));
      return;
    }

    const { error: err } = await client.auth.signInWithOtp({
      email: trimmed,
      // base-aware: "/app/" on founderfirst.one/app/, "/" on penny.founderfirst.one
      options: {
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
        captchaToken: captchaToken ?? undefined,
      },
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
            {/* .page-title = the authed type scale (design-system "Authed surfaces");
                never a bare <h1>, which sits on the public billboard scale. */}
            <h1 className="page-title">{COPY.auth.signIn}</h1>
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
            {hasTurnstile && <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={setCaptchaToken} />}
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
