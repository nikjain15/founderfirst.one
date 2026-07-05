import { useState, type FormEvent } from "react";
import { getClient } from "../lib/supabase";
import { IconCheck, IconAlert } from "../lib/icons";
import { hasTurnstile, TURNSTILE_SITE_KEY } from "../lib/env";
import { Turnstile } from "../lib/Turnstile";
import { canDispatchOtp } from "../lib/otpGate";

export function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "sending" | "ok" | "err"; msg?: string }>({ kind: "idle" });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setStatus({ kind: "sending" });
    const db = getClient();

    // Server-side rate limit (card SEC-2), checked before dispatch.
    const { data: rateLimitRaw, error: rateLimitErr } = await db.rpc(
      "check_and_record_otp_attempt",
      { p_email: trimmed },
    );
    if (rateLimitErr) {
      setStatus({ kind: "err", msg: rateLimitErr.message });
      return;
    }
    const rateLimit = rateLimitRaw as { allowed: true } | { allowed: false; retry_after_seconds: number };

    const gate = canDispatchOtp({ hasTurnstile, captchaToken, rateLimit });
    if (!gate.ok) {
      const minutes = gate.reason === "rate_limited" ? Math.ceil(gate.retryAfterSeconds / 60) : 0;
      setStatus({
        kind: "err",
        msg:
          gate.reason === "captcha_required"
            ? "Complete the check above, then send the link."
            : `Too many attempts for this email — try again in ${minutes <= 1 ? "a minute" : `${minutes} minutes`}.`,
      });
      return;
    }

    // Membership is checked server-side after sign-in (see App.tsx). We
    // intentionally don't pre-check here: it would require a public read of
    // the admins table, and the post-login gate is the authoritative one.
    const { error } = await db.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/admin/support`,
        captchaToken: captchaToken ?? undefined,
      },
    });
    if (error) {
      setStatus({ kind: "err", msg: error.message });
      return;
    }
    setStatus({ kind: "ok", msg: "Link's on its way. Check your inbox." });
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="ff-mark ff-mark-md">FF</span>
        <div className="eyebrow">Admin · support</div>
        <h1>Sign in.</h1>
        <p className="sub">One email, one link. No password to remember.</p>

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@founderfirst.one"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {hasTurnstile && <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={setCaptchaToken} />}

          <button className="btn" type="submit" disabled={status.kind === "sending"}>
            {status.kind === "sending" ? "Sending…" : "Send link →"}
          </button>

          {status.msg && (
            <div className={`login-status ${status.kind === "err" ? "err" : status.kind === "ok" ? "ok" : ""}`}>
              {status.kind === "ok" && <IconCheck size={14} />}
              {status.kind === "err" && <IconAlert size={14} />}
              {status.msg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
