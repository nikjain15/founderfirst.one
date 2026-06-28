/**
 * invites — issue an invite (the write-path; ARCHITECTURE.md §5, §8, §B2.2).
 *
 * POST { org_id, email, kind: 'member' | 'cpa', access?: 'read_only'|'full' }
 *   kind='member' → invite a teammate into org_id (membership invite).
 *                   role = 'member' for a business, 'cpa' for a firm.
 *   kind='cpa'    → invite a CPA to engage this business (engagement invite);
 *                   `access` (read_only|full) is what the owner grants at accept.
 *
 * Authz (caller must be authed + privileged in org_id):
 *   - member invite: caller is owner (business) or firm_admin (firm).
 *   - cpa invite:    caller is owner of the business (owner-only, §B1).
 *
 * Returns { token, accept_path } — emailing the link comes later; for now the
 * caller surfaces the link. Accepting the invite is the ONLY path to access.
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
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
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
  const orgId = String(body?.org_id ?? "");
  const email = String(body?.email ?? "").trim().toLowerCase();
  const kind = body?.kind;
  const access = body?.access;
  if (!orgId) return json({ error: "bad_org" }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "bad_email" }, 400);
  if (kind !== "member" && kind !== "cpa") return json({ error: "bad_kind" }, 400);
  if (kind === "cpa" && access !== "read_only" && access !== "full") {
    return json({ error: "bad_access" }, 400);
  }

  // Load caller's membership + the org type to authorize.
  const { data: mem } = await svc
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  const { data: org } = await svc
    .from("organizations")
    .select("type")
    .eq("id", orgId)
    .maybeSingle();
  if (!mem || !org) return json({ error: "forbidden" }, 403);

  if (kind === "cpa") {
    // engagement invite: only a business owner may invite a CPA
    if (org.type !== "business" || mem.role !== "owner") {
      return json({ error: "forbidden" }, 403);
    }
  } else {
    // member invite: owner of a business, or firm_admin of a firm
    const ok =
      (org.type === "business" && mem.role === "owner") ||
      (org.type === "firm" && mem.role === "firm_admin");
    if (!ok) return json({ error: "forbidden" }, 403);
  }

  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const intended_role = kind === "member"
    ? (org.type === "firm" ? "cpa" : "member")
    : null;
  const intended_access = kind === "cpa" ? access : null;
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: invErr } = await svc.from("invites").insert({
    token,
    target_org_id: orgId,
    intended_role,
    intended_access,
    email,
    invited_by: user.id,
    expires_at,
  });
  if (invErr) return json({ error: "invite_failed", detail: invErr.message }, 400);

  return json({ token, accept_path: `/app/accept?token=${token}` }, 201);
});
