import { useState, type FormEvent } from "react";
import { getClient } from "../lib/supabase";
import { ADMIN_EMAIL } from "../lib/env";

export function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "sending" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    if (ADMIN_EMAIL && trimmed !== ADMIN_EMAIL) {
      setStatus({ kind: "err", msg: "Not an admin address." });
      return;
    }

    setStatus({ kind: "sending" });
    const db = getClient();
    const { error } = await db.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: `${window.location.origin}/admin/support` },
    });
    if (error) {
      setStatus({ kind: "err", msg: error.message });
      return;
    }
    setStatus({ kind: "ok", msg: "Check your email — link's on its way." });
  }

  return (
    <div className="login-card">
      <h1 className="page-title">Sign in</h1>
      <p className="page-sub">Magic link, no password.</p>

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

        <button className="btn" type="submit" disabled={status.kind === "sending"}>
          {status.kind === "sending" ? "Sending…" : "Send link"}
        </button>

        {status.msg && (
          <div className={`login-status ${status.kind === "err" ? "err" : status.kind === "ok" ? "ok" : ""}`}>
            {status.msg}
          </div>
        )}
      </form>
    </div>
  );
}
