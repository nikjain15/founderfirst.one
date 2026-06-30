/**
 * invites-accept — accept an invite (the write-path; ARCHITECTURE.md §5, §B2.2).
 *
 * POST { token }  (authed — the invitee)
 *
 * Accepting is the ONLY way to gain a membership / activate an engagement:
 *   - membership invite (intended_role) → membership(invitee, target_org, role).
 *   - engagement invite (intended_access) → the invitee is a CPA: use their firm
 *     (or auto-create a firm-of-one if they have none), create an active
 *     engagement firm→business with the granted access, and assign the invitee.
 *
 * Idempotent-ish: a consumed/expired token is rejected; an already-active
 * engagement returns "already_engaged" rather than duplicating.
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
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function practiceName(email: string): string {
  const local = email.split("@")[0]?.split(/[._+-]/)[0] ?? "Your";
  const name = local ? local.charAt(0).toUpperCase() + local.slice(1) : "Your";
  return `${name}'s practice`;
}

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
  const token = String(body?.token ?? "");
  if (!token) return json({ error: "bad_token" }, 400);

  const { data: invite } = await svc
    .from("invites")
    .select("id,target_org_id,intended_role,intended_access,invited_by,expires_at,accepted_at,email")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return json({ error: "invalid_token" }, 404);
  if (invite.accepted_at) return json({ error: "already_accepted" }, 409);
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return json({ error: "expired" }, 410);
  }
  // An invite is bound to the email it was issued to. Possession of the token is
  // not enough — only the named recipient may accept, so a forwarded/leaked link
  // can't be redeemed by someone else to gain membership/engagement access.
  if ((user.email ?? "").toLowerCase().trim() !== String(invite.email ?? "").toLowerCase().trim()) {
    return json({ error: "wrong_recipient" }, 403);
  }

  // ── membership invite ──────────────────────────────────────────────
  if (invite.intended_role) {
    const { error: memErr } = await svc.from("memberships").upsert(
      { user_id: user.id, org_id: invite.target_org_id, role: invite.intended_role, status: "active" },
      { onConflict: "user_id,org_id" },
    );
    if (memErr) return json({ error: "accept_failed", detail: memErr.message }, 400);
    await svc.from("invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
    return json({ ok: true, org_id: invite.target_org_id, lens: "owner_or_member" }, 200);
  }

  // ── engagement invite (CPA) ────────────────────────────────────────
  // Find the invitee's firm; create a firm-of-one if they have none.
  const { data: firmRows } = await svc
    .from("memberships")
    .select("org_id, organizations!inner(type)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("organizations.type", "firm");
  let firmId = firmRows && firmRows.length > 0 ? (firmRows[0] as { org_id: string }).org_id : null;

  if (!firmId) {
    const { data: firm, error: firmErr } = await svc
      .from("organizations")
      .insert({ type: "firm", name: practiceName(user.email ?? ""), created_by: user.id })
      .select("id")
      .single();
    if (firmErr || !firm) return json({ error: "firm_create_failed", detail: firmErr?.message }, 400);
    firmId = firm.id;
    await svc.from("memberships").insert({ user_id: user.id, org_id: firmId, role: "firm_admin", status: "active" });
    await svc.from("subscriptions").insert({ billable_org_id: firmId, plan: "pilot_free" });
  }

  // Activate the engagement firm → client business with the granted access.
  const { data: eng, error: engErr } = await svc
    .from("engagements")
    .insert({
      firm_org_id: firmId,
      client_org_id: invite.target_org_id,
      status: "active",
      access: invite.intended_access,
      initiated_by: invite.invited_by,
    })
    .select("id")
    .single();
  if (engErr) {
    // unique(firm_org_id, client_org_id) — already linked
    if (engErr.code === "23505") return json({ error: "already_engaged" }, 409);
    return json({ error: "engagement_failed", detail: engErr.message }, 400);
  }

  // Assign the accepting CPA to this client so they can see it.
  await svc.from("client_assignments").insert({
    engagement_id: eng.id,
    user_id: user.id,
    assigned_by: user.id,
  });
  await svc.from("invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);

  return json({ ok: true, org_id: invite.target_org_id, lens: "cpa", firm_id: firmId }, 200);
});
