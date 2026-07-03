import { useState } from "react";

// @supabase/supabase-js and posthog-js (via ../lib/analytics) are the two heaviest
// deps on this island. They're only needed on submit — a user interaction, never at
// first paint — so we dynamic-import them inside the handler. This keeps the hero's
// hydration bundle tiny and off the LCP/TBT critical path (the ~100K Supabase +
// ~180K PostHog chunks no longer load eagerly with the above-the-fold form).

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
      const ref = new URLSearchParams(window.location.search).get("ref");
      let slug: string | null = null;
      if (URL && ANON) {
        const { createClient } = await import("@supabase/supabase-js");
        const db = createClient(URL, ANON);
        const { data, error } = await db.rpc("signup_to_waitlist", {
          p_email: email, p_source: source, p_referred_by: ref, p_slug_seed: null,
        });
        if (error) throw new Error(error.message);
        // RPC returns TABLE(slug, already_on_list).
        const row = Array.isArray(data) ? data[0] : data;
        slug = row?.slug ?? null;
        // Send the welcome email for genuinely new signups only. Fire-and-forget:
        // a send failure must never break signup (idempotency is also enforced
        // server-side, so a stray double-call can't double-send).
        if (row && !row.already_on_list) {
          void db.functions.invoke("signup-confirmation", { body: { email, slug } })
            .catch(() => { /* non-blocking */ });
        }
      }
      // Conversion event for the learning loop — PostHog auto-attaches any active
      // experiment flag, so this attributes the signup to its variant. Imported
      // lazily so posthog-js stays off the first-paint path.
      const { track } = await import("../lib/analytics");
      track("signup", { source });
      setState("done");
      setMsg("You're in! Taking you to your welcome page…");
      // Redirect to the on-brand confirmed/welcome page. Carry the slug (for the
      // referral share UI) and any inbound referral param.
      const params = new URLSearchParams();
      if (slug) params.set("slug", slug);
      if (ref) params.set("ref", ref);
      const qs = params.toString();
      window.location.href = qs ? `/confirmed/?${qs}` : "/confirmed/";
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
        placeholder="Your best email" aria-label="Email" autoComplete="email"
        inputMode="email" spellCheck={false} required
      />
      <button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Saving…" : `${ctaLabel} →`}
      </button>
      {state === "error" && <span className="signup-err" role="alert">{msg}</span>}
    </form>
  );
}
