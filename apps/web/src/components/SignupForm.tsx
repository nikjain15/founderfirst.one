import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

/**
 * Waitlist signup — a React island (Astro renders it interactive). Calls the
 * same `signup_to_waitlist` SECURITY DEFINER RPC the legacy site uses; the anon
 * key has no direct table access. Falls back to a friendly success in preview
 * (no env) so the flow always works.
 */
const URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignupForm({ source, ctaLabel }: { source: string; ctaLabel: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) { setState("error"); setMsg("Please enter a valid email."); return; }
    setState("sending"); setMsg("");
    try {
      if (URL && ANON) {
        const ref = new URLSearchParams(window.location.search).get("ref");
        const db = createClient(URL, ANON);
        const { error } = await db.rpc("signup_to_waitlist", {
          p_email: email, p_source: source, p_referred_by: ref, p_slug_seed: null,
        });
        if (error) throw new Error(error.message);
      }
      setState("done");
      setMsg("You're on the list — we'll save your spot and email you when it opens.");
    } catch {
      setState("error");
      setMsg("Something went wrong. Please try again.");
    }
  }

  if (state === "done") {
    return <p className="signup-done" role="status">✓ {msg}</p>;
  }

  return (
    <form className="signup" onSubmit={submit} noValidate>
      <input
        type="email" name="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)}
        placeholder="you@yourbusiness.com" aria-label="Email" autoComplete="email"
        inputMode="email" spellCheck={false} required
      />
      <button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Saving…" : `${ctaLabel} →`}
      </button>
      {state === "error" && <span className="signup-err" role="alert">{msg}</span>}
    </form>
  );
}
