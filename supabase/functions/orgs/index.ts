/**
 * orgs — create a business or firm (the write-path; ARCHITECTURE.md §8, §C10).
 *
 * POST { type: 'business' | 'firm', name }  (verify_jwt = true)
 *
 * Backbone tables are RLS-locked against client writes (no_client_write), so org
 * creation must go through this service-role function. It:
 *   1. verifies the caller's JWT → auth.uid()
 *   2. validates + sanitizes the name, validates the type
 *   3. calls create_org_atomic(user, type, name) — ONE transaction that inserts the
 *      org + the caller's membership (owner|firm_admin) + a pilot_free subscription,
 *      with the settings trigger firing on the org insert. All-or-nothing, so a
 *      partial failure can never leave an orphan org / membership-less / entitlement-
 *      less org behind (it also caps per-user org count and dedupes double-submits).
 *
 * The membership is what grants the caller access (RLS has_membership), so this is
 * the only way a user gets into a new org — consistent with "accepting/creating is
 * the only path to access".
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Strip control / zero-width / bidi-override chars so a name can't smuggle invisible
// or direction-flipping characters into the org switcher (display spoofing): C0/C1
// controls, zero-width + bidi marks, embeddings/overrides, isolates, and the BOM.
// Visible content — including emoji — is preserved. Then collapse whitespace + trim.
const UNSAFE_NAME_CHARS = new RegExp(
  "[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]",
  "g",
);
function sanitizeOrgName(raw: string): string {
  return raw.replace(UNSAFE_NAME_CHARS, "").replace(/\s+/g, " ").trim();
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const type = body?.type;
  // Reject non-string names outright — String(...) used to coerce {}, [], numbers
  // into junk org names ("[object Object]", "1,2,3", "12345") that all passed.
  if (typeof body?.name !== "string") return json({ error: "bad_name" }, 400);
  const name = sanitizeOrgName(body.name);
  if (type !== "business" && type !== "firm") return json({ error: "bad_type" }, 400);
  if (name.length < 1 || name.length > 120) return json({ error: "bad_name" }, 400);

  // One transaction: org + membership + subscription (+ settings trigger). Atomic,
  // capped, and double-submit-deduped — see 20260630130000_org_create_atomic.sql.
  const { data: org, error: rpcErr } = await svc
    .rpc("create_org_atomic", { p_user: user.id, p_type: type, p_name: name })
    .select("id,name,type,approval_status")
    .single();

  if (rpcErr || !org) {
    const msg = rpcErr?.message ?? "";
    if (msg.includes("org_limit_reached")) return json({ error: "org_limit_reached" }, 429);
    if (msg.includes("bad_name")) return json({ error: "bad_name" }, 400);
    if (msg.includes("bad_type")) return json({ error: "bad_type" }, 400);
    if (msg.includes("unauthorized")) return json({ error: "unauthorized" }, 401);
    return json({ error: "create_failed", detail: msg }, 400);
  }

  // A new org lands 'pending' (signup approval gate). Tell Nik so he can approve it:
  // email to founder@ + a Discord ping. Best-effort — a notify failure never blocks
  // the signup (the org is also visible in the console Approvals queue regardless).
  if (org.approval_status === "pending") {
    try {
      await notifyPendingSignup({ name: org.name, type: org.type, ownerEmail: user.email ?? "unknown" });
    } catch (e) {
      console.error("pending-signup notify failed (non-fatal):", e);
    }
  }

  return json({ org }, 201);
});

/** Notify staff of a new signup awaiting approval. Both channels are best-effort. */
async function notifyPendingSignup(s: { name: string; type: string; ownerEmail: string }) {
  const line = `New ${s.type} signup pending approval: "${s.name}" — ${s.ownerEmail}. Approve or decline in penny.founderfirst.one/admin.`;

  // 1 · Email to the founder inbox via Resend (raw send — no template needed).
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM");
  if (resendKey && from) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: ["founder@founderfirst.one"],
        subject: `New signup pending approval — ${s.name}`,
        text: line,
      }),
    }).catch((e) => console.error("resend notify failed:", e));
  }

  // 2 · Discord ping via a webhook (set DISCORD_ADMIN_WEBHOOK to enable).
  const discord = Deno.env.get("DISCORD_ADMIN_WEBHOOK");
  if (discord) {
    await fetch(discord, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `🟡 ${line}` }),
    }).catch((e) => console.error("discord notify failed:", e));
  }
}
