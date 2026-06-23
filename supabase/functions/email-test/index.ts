/**
 * email-test — send ONE test of any email (built-in or custom) to a chosen
 * address, so an admin can check a template before scheduling it.
 *
 * Admin-gated: valid JWT + membership in admins (mirrors email-preview). Sends
 * through the shared sendEmail() path with trigger='test', so it's logged and
 * open-tracked like a real send.
 *
 * Auth: verify_jwt = false; JWT + admin check in code.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/send.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email) return json({ error: "unauthorized" }, 401);
  const { data: adminRow } = await userClient
    .from("admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
  if (!adminRow) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const key: string = body?.key ?? "";
  // Default the test recipient to the caller — never blast a list from here.
  const to: string = (body?.to ?? user.email).trim().toLowerCase();
  if (!key) return json({ error: "missing_key" }, 400);
  if (!EMAIL_RE.test(to)) return json({ error: "bad_recipient" }, 400);

  const supa = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const result = await sendEmail({
    supa, key, to: [to], trigger: "test", ctaHref: body?.cta_href || "#",
  });
  if (!result.ok && result.sent === 0) return json({ ok: false, error: "send_failed", detail: result.detail }, 502);
  return json({ ok: true, sent: result.sent });
});
