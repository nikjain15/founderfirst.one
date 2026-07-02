/**
 * loop-heartbeat — the single write-path for the build-loop dashboard (LOOP-1).
 *
 * Every loop session (builder / red-team / integrator) POSTs here every ≤10 min
 * to say "I'm alive and here's my current step". We upsert one `loop_runs` row per
 * session (keyed by session_tag) and append a `loop_events` step-log row. The admin
 * Build tab (/admin → Settings → Build) reads those tables and flags any beat that
 * is >30 min stale as ⚠ dead.
 *
 * Auth: verify_jwt = false (see ../../config.toml) — a shared bearer secret gates it.
 * Loop sessions read the token from ~/.config/founderfirst/secrets.env, so there is
 * NO per-session token minting. The token is NEVER hardcoded — it's read from the
 * LOOP_HEARTBEAT_TOKEN fn secret (same env-secret pattern as listening-intake).
 *
 * Secrets required (set via `supabase secrets set`):
 *   LOOP_HEARTBEAT_TOKEN       — shared bearer secret; sessions send it as
 *                                `Authorization: Bearer <token>`
 *   SUPABASE_URL               — auto-provided
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-provided; used to write (RLS is read-only for
 *                                admins, so writes MUST go through service_role here)
 *
 * Request body (all optional except session_tag):
 *   { session_tag, role?, card?, phase?, status?, pr_url?, blocked_reason?, event? }
 * `event` is a short free-text step message appended to loop_events.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Must match the loop_runs.status CHECK constraint in the migration.
const ALLOWED_STATUS = ["running", "pr-open", "blocked", "red-teaming", "done"];
const ALLOWED_ROLE = ["builder", "red-team", "integrator"];

function clip(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * Constant-time string comparison for the shared bearer secret. A plain `a !== b`
 * short-circuits on the first differing byte, leaking token length/prefix via
 * response timing (same class as the ISOTEST forged-actor findings). We compare
 * every byte regardless of mismatch. Length is not itself secret, but folding it
 * into the accumulator avoids an early-exit branch. Both args must be non-empty.
 */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

type Payload = {
  session_tag?: string;
  role?: string;
  card?: string;
  phase?: string;
  status?: string;
  pr_url?: string | null;
  blocked_reason?: string | null;
  event?: string | null;
};

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  // Shared bearer-token auth — only holders of LOOP_HEARTBEAT_TOKEN may write.
  const expected = Deno.env.get("LOOP_HEARTBEAT_TOKEN");
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!expected || !safeEqual(presented, expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Payload;
  try { body = await req.json(); }
  catch { return json({ error: "bad_json" }, 400); }

  const sessionTag = clip(body.session_tag, 120);
  if (!sessionTag) return json({ error: "missing_session_tag" }, 400);

  const role = body.role && ALLOWED_ROLE.includes(body.role) ? body.role : "builder";
  const status = body.status && ALLOWED_STATUS.includes(body.status) ? body.status : "running";
  const now = new Date().toISOString();

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Upsert one row per session_tag: a reconnecting session updates in place.
  const { error: upErr } = await supa
    .from("loop_runs")
    .upsert(
      {
        session_tag:    sessionTag,
        role,
        card:           clip(body.card, 60),
        phase:          clip(body.phase, 500),
        status,
        pr_url:         clip(body.pr_url, 2000),
        blocked_reason: clip(body.blocked_reason, 2000),
        last_beat:      now,
        updated_at:     now,
      },
      { onConflict: "session_tag" },
    );
  if (upErr) return json({ error: "upsert_failed", detail: upErr.message }, 500);

  // Append a step-log event when the caller supplied one (phase change / note).
  const eventMsg = clip(body.event, 1000) ?? clip(body.phase, 1000);
  if (eventMsg) {
    await supa.from("loop_events").insert({
      session_tag: sessionTag,
      kind:        body.event ? "step" : "status",
      message:     eventMsg,
    });
  }

  return json({ ok: true, session_tag: sessionTag, last_beat: now });
}

// Only bind the port when run as the entrypoint — importing for unit tests
// (index.test.ts) must not start a listener.
if (import.meta.main) Deno.serve(handle);
