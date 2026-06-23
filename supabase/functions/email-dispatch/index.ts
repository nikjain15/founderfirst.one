/**
 * email-dispatch — sends due custom scheduled emails.
 *
 * pg_cron fires email_dispatch_tick() hourly, which POSTs here with the shared
 * secret. We read enabled rows from email_schedules, decide which are due *this
 * hour* (UTC), and send each through the shared sendEmail() path — so custom
 * emails are branded, logged, and open-tracked like the built-ins. 'once'
 * schedules disable themselves after firing.
 *
 * Auth: verify_jwt = false; the shared secret gates it (same as listening-digest).
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/send.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

type Schedule = {
  id: string; email_key: string; frequency: "once" | "daily" | "weekly";
  send_hour: number; send_dow: number | null; run_at: string | null;
  audience_kind: "admins" | "list"; audience_list: string[];
  cta_href: string; enabled: boolean; last_run_at: string | null;
};

function isDue(s: Schedule, now: Date): boolean {
  const hour = now.getUTCHours();
  const last = s.last_run_at ? new Date(s.last_run_at) : null;

  if (s.frequency === "once") {
    return !!s.run_at && now.getTime() >= new Date(s.run_at).getTime() && !last;
  }
  if (hour !== s.send_hour) return false;
  if (s.frequency === "daily") {
    // Due once per UTC day at the chosen hour.
    return !last || last.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10);
  }
  // weekly
  if (now.getUTCDay() !== s.send_dow) return false;
  return !last || now.getTime() - last.getTime() > 6 * 86_400_000;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expected = Deno.env.get("LISTENING_INTAKE_SECRET");
  if (!expected || req.headers.get("x-listening-secret") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: schedules, error } = await supa
    .from("email_schedules").select("*").eq("enabled", true);
  if (error) return json({ error: "load_failed", detail: error.message }, 500);

  const now = new Date();
  const due = (schedules as Schedule[] ?? []).filter((s) => isDue(s, now));
  if (!due.length) return json({ ok: true, sent: 0, reason: "nothing_due" });

  // Resolve the admin list once if any schedule targets it.
  let adminEmails: string[] = [];
  if (due.some((s) => s.audience_kind === "admins")) {
    const { data: admins } = await supa.from("admins").select("email");
    adminEmails = (admins ?? []).map((r: { email: string }) => r.email).filter(Boolean);
  }

  const results: Array<{ id: string; sent: number; failed: number }> = [];
  for (const s of due) {
    const to = s.audience_kind === "admins"
      ? adminEmails
      : (s.audience_list ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);

    if (to.length) {
      const r = await sendEmail({
        supa, key: s.email_key, to, trigger: "cron",
        ctaHref: s.cta_href || "#",
      });
      results.push({ id: s.id, sent: r.sent, failed: r.failed });
    } else {
      results.push({ id: s.id, sent: 0, failed: 0 });
    }

    // Record the run; 'once' schedules fire exactly once.
    const patch: Record<string, unknown> = { last_run_at: now.toISOString() };
    if (s.frequency === "once") patch.enabled = false;
    await supa.from("email_schedules").update(patch).eq("id", s.id);
  }

  return json({ ok: true, dispatched: results.length, results });
});
