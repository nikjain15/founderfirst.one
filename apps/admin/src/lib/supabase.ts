/**
 * Supabase client + ticket RPC wrappers.
 *
 * RPCs called here all require an authenticated session (see SCHEMA.sql).
 * Magic-link login happens in Login.tsx; the resulting JWT travels with
 * every RPC call automatically once the client is initialized.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, hasSupabase } from "./env";
import type { Database } from "./database.types";
import { CONTENT_MOCK, mockContent } from "./contentMock"; // dev-only Site-content mock

/** Row type for any public table, e.g. Row<"admins">. Generated from the live
 *  schema by `supabase gen types` — see database.types.ts. Prefer this over
 *  hand-written interfaces so the compiler catches schema drift. */
export type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

// NOTE: the client is intentionally left untyped for now. Flipping it to
// SupabaseClient<Database> surfaces ~30 pre-existing mismatches (RPC return
// casts + null-vs-undefined in hand-written interfaces) AND a real drift bug
// (the audit_runs migration never applied to prod — duplicate timestamp).
// Adopt <Database> table-by-table once those are resolved. Until then, opt in
// per-file with the Row<> helper above.
let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!hasSupabase) {
    throw new Error(
      "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.",
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

// ---- Admin allow-list ------------------------------------------------------

export interface AdminRow {
  email: string;
  added_at: string;
  added_by: string | null;
  is_super: boolean;
}

export async function isAdmin(email: string): Promise<boolean> {
  const db = getClient();
  const { data, error } = await db
    .from("admins")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`isAdmin: ${error.message}`);
  return !!data;
}

export async function listAdmins(): Promise<AdminRow[]> {
  const db = getClient();
  const { data, error } = await db
    .from("admins")
    .select("email, added_at, added_by, is_super")
    .order("added_at", { ascending: true });
  if (error) throw new Error(`listAdmins: ${error.message}`);
  return (data as AdminRow[]) ?? [];
}

export async function inviteAdmin(email: string): Promise<void> {
  const db = getClient();
  const me = (await db.auth.getUser()).data.user?.email ?? null;
  const { error } = await db
    .from("admins")
    .insert({ email: email.trim().toLowerCase(), added_by: me });
  if (error) throw new Error(error.message);
}

export async function removeAdmin(email: string): Promise<void> {
  const db = getClient();
  const { error } = await db.from("admins").delete().eq("email", email);
  if (error) throw new Error(error.message);
}

// ---- Quality audit runs (the /quality dashboard) ---------------------------

export interface AuditDimensionScore {
  score: number; // 0–100
  p0: number;
  p1: number;
  p2: number;
}

export interface AuditRunRow {
  id: string;
  run_at: string;
  commit_sha: string | null;
  overall: number; // 0–100
  dimensions: Record<string, AuditDimensionScore>;
  totals: { p0?: number; p1?: number; p2?: number };
  summary: string;
  pr_url: string | null;
}

// Newest first. The dashboard takes the head as "current" and the tail for trend.
export async function listAuditRuns(limit = 26): Promise<AuditRunRow[]> {
  const db = getClient();
  const { data, error } = await db
    .from("audit_runs")
    .select("id, run_at, commit_sha, overall, dimensions, totals, summary, pr_url")
    .order("run_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listAuditRuns: ${error.message}`);
  return (data as AuditRunRow[]) ?? [];
}

// ---- AI quality & cost (the /ai-quality dashboard) -------------------------
// Reads ai_decisions (Phase 0) via is_admin()-gated RPCs. Numeric columns come
// back from PostgREST as strings (precision-preserving) for the table RPCs; the
// jsonb KPI blob returns real numbers. The dashboard coerces with Number().

export interface AIKpis {
  window_days: number;
  decision_count: number;
  total_cost_usd: number;
  resolved_count: number;
  cost_per_resolved: number | null;
  avg_latency_ms: number | null;
  cache_hit_pct: number | null;
  awaiting_review: number;
  judge_cost_usd: number | null; // Phase 2
  judge_cost_pct: number | null; // Phase 2
  zero_edit_pct: number | null;  // Phase 3
}

export interface AIUseCaseRow {
  use_case: string;
  decisions: number;
  total_cost: number | string;
  cost_per_task: number | string | null;
  avg_latency_ms: number | null;
  cache_hit_pct: number | null;
  awaiting_review: number;
  models: string[];
}

export interface AIDailyRow { day: string; cost: number | string; decisions: number }

export interface AIReconcileRow {
  surface: string;
  run_at: string;
  window_days: number;
  legacy_count: number;
  new_count: number;
  drift: number;
  note: string;
}

export interface AIOverview {
  kpis: AIKpis;
  useCases: AIUseCaseRow[];
  daily: AIDailyRow[];
  reconcile: AIReconcileRow[];
}

export async function getAIOverview(days = 30): Promise<AIOverview> {
  const db = getClient();
  const [kpis, useCases, daily, reconcile] = await Promise.all([
    db.rpc("admin_ai_kpis", { p_days: days }),
    db.rpc("admin_ai_usecases", { p_days: days }),
    db.rpc("admin_ai_daily", { p_days: days }),
    db.rpc("admin_ai_reconcile_latest"),
  ]);
  for (const r of [kpis, useCases, daily, reconcile]) {
    if (r.error) throw new Error(`getAIOverview: ${r.error.message}`);
  }
  return {
    kpis: (kpis.data as AIKpis) ?? null,
    useCases: (useCases.data as AIUseCaseRow[]) ?? [],
    daily: (daily.data as AIDailyRow[]) ?? [],
    reconcile: (reconcile.data as AIReconcileRow[]) ?? [],
  };
}

// ---- Changelog ("What's new") ----------------------------------------------

export type ChangelogKind = "new" | "improved" | "fixed";

export interface ChangelogEntry {
  id: string;
  kind: ChangelogKind;
  title: string;
  body: string;
  created_at: string;
  created_by: string | null;
}

export async function listChangelog(): Promise<ChangelogEntry[]> {
  const db = getClient();
  const { data, error } = await db
    .from("changelog_entries")
    .select("id, kind, title, body, created_at, created_by")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listChangelog: ${error.message}`);
  return (data as ChangelogEntry[]) ?? [];
}

export async function addChangelogEntry(
  entry: { kind: ChangelogKind; title: string; body: string },
): Promise<ChangelogEntry> {
  const db = getClient();
  // created_by defaults to auth.email() in the DB; no need to pass it.
  const { data, error } = await db
    .from("changelog_entries")
    .insert({ kind: entry.kind, title: entry.title.trim(), body: entry.body.trim() })
    .select("id, kind, title, body, created_at, created_by")
    .single();
  if (error) throw new Error(error.message);
  void logAudit("changelog.add", "changelog_entry", data.id, {
    kind: entry.kind,
    title: entry.title.trim(),
  });
  return data as ChangelogEntry;
}

export async function deleteChangelogEntry(id: string): Promise<void> {
  const db = getClient();
  const { error } = await db.from("changelog_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
  void logAudit("changelog.delete", "changelog_entry", id, {});
}

export interface DigestPreview {
  entryCount: number;
  recipientCount: number;
  subject: string;
  html: string;
  text: string;
}

/** Render this week's digest exactly as recipients would see it — sends nothing. */
export async function previewWeeklyDigest(): Promise<DigestPreview> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("changelog-digest", {
    body: { mode: "preview" },
  });
  if (error) throw new Error(`previewWeeklyDigest: ${error.message}`);
  return data as DigestPreview;
}

/** Send this week's digest to all admins. Only an admin (the caller) can do this. */
export async function sendWeeklyDigest(): Promise<{ sent: number; entryCount: number }> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("changelog-digest", {
    body: { mode: "send" },
  });
  if (error) throw new Error(`sendWeeklyDigest: ${error.message}`);
  void logAudit("changelog.send_digest", "changelog", null, {
    sent: data?.sent ?? 0,
    entries: data?.entryCount ?? 0,
  });
  return { sent: data?.sent ?? 0, entryCount: data?.entryCount ?? 0 };
}

export interface DigestSend {
  sent_at: string;
  sent_by: string | null;
  entry_count: number;
  recipients: number;
}

/** The most recent digest send, for the "last sent" indicator. */
export async function lastDigestSend(): Promise<DigestSend | null> {
  const db = getClient();
  const { data, error } = await db
    .from("changelog_sends")
    .select("sent_at, sent_by, entry_count, recipients")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`lastDigestSend: ${error.message}`);
  return (data as DigestSend) ?? null;
}

// ---- Email control (brand + templates + activity) --------------------------
// Brand colors + per-email copy are admin-editable rows; the edge functions read
// them at send time. Activity is the unified send log + open/click rates.

export interface EmailBrand {
  sender_name: string;
  ink: string; ink2: string; ink3: string; ink4: string;
  line: string; paper: string; white: string;
  income: string; amber: string; error: string;
  updated_at?: string;
}

export interface EmailTemplate {
  email_key: string;
  label: string;
  eyebrow: string;
  subject: string;
  preheader: string;
  heading: string;
  intro: string;
  cta_label: string;
  footer: string;
  body?: string;
  is_custom?: boolean;
  updated_at?: string;
}

export interface EmailSchedule {
  id: string;
  email_key: string;
  frequency: "once" | "daily" | "weekly";
  send_hour: number;
  send_dow: number | null;
  run_at: string | null;
  audience_kind: "admins" | "list";
  audience_list: string[];
  cta_href: string;
  enabled: boolean;
  last_run_at: string | null;
  // Built-in classification (see 20260623280000_email_schedules_builtin.sql).
  is_builtin: boolean;
  kind: "schedule" | "event";
  dispatch: "generic" | "invoke" | "event";
  invoke_fn: string | null;
  invoke_mode: string | null;
  trigger_label: string | null;
}

export interface EmailSettings {
  signals_intent_min: number;
  signals_floor_days: number;
}

export async function getEmailBrand(): Promise<EmailBrand> {
  const db = getClient();
  const { data, error } = await db.from("email_brand").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error(`getEmailBrand: ${error.message}`);
  return data as EmailBrand;
}

export async function saveEmailBrand(patch: Partial<EmailBrand>): Promise<void> {
  const db = getClient();
  const me = (await db.auth.getUser()).data.user?.email ?? null;
  const { error } = await db.from("email_brand")
    .update({ ...patch, updated_by: me, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw new Error(error.message);
  void logAudit("email.brand.update", "email_brand", null, {});
}

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const db = getClient();
  const { data, error } = await db.from("email_templates")
    .select("*").order("label", { ascending: true });
  if (error) throw new Error(`listEmailTemplates: ${error.message}`);
  return (data as EmailTemplate[]) ?? [];
}

export async function saveEmailTemplate(key: string, patch: Partial<EmailTemplate>): Promise<void> {
  const db = getClient();
  const me = (await db.auth.getUser()).data.user?.email ?? null;
  const { error } = await db.from("email_templates")
    .update({ ...patch, updated_by: me, updated_at: new Date().toISOString() })
    .eq("email_key", key);
  if (error) throw new Error(error.message);
  void logAudit("email.template.update", "email_template", key, {});
}

export async function getEmailSettings(): Promise<EmailSettings> {
  const db = getClient();
  const { data, error } = await db.from("email_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error(`getEmailSettings: ${error.message}`);
  return data as EmailSettings;
}

export async function saveEmailSettings(patch: Partial<EmailSettings>): Promise<void> {
  const db = getClient();
  const me = (await db.auth.getUser()).data.user?.email ?? null;
  const { error } = await db.from("email_settings")
    .update({ ...patch, updated_by: me, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw new Error(error.message);
  void logAudit("email.settings.update", "email_settings", null, {});
}

export interface EmailPreviewFilled {
  subject: string; preheader: string; eyebrow: string; heading: string;
  intro: string; cta_label: string; footer: string;
}
/** Render a draft template (unsaved) with sample data — for the live preview.
 *  Returns the token-filled subject + preheader + every filled field, so the
 *  editor can show the human version of templated copy. */
export async function previewEmailTemplate(
  key: string, template: Partial<EmailTemplate>, brand: Partial<EmailBrand>,
): Promise<{ subject: string; preheader: string; filled: EmailPreviewFilled; vars: Record<string, string>; html: string }> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("email-preview", {
    body: { key, template, brand },
  });
  if (error) throw new Error(`previewEmailTemplate: ${error.message}`);
  return data as { subject: string; preheader: string; filled: EmailPreviewFilled; vars: Record<string, string>; html: string };
}

export interface EmailActivityRow {
  id: string;
  email_key: string;
  subject: string;
  recipient_count: number;
  trigger: "cron" | "admin" | "db_trigger" | "test";
  status: "sent" | "failed" | "skipped";
  created_at: string;
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
}

export interface EmailActivity {
  since_days: number;
  sends: EmailActivityRow[];
  totals: { sent: number; failed: number; opened: number; clicked: number };
}

export async function getEmailActivity(days = 30): Promise<EmailActivity> {
  const db = getClient();
  const { data, error } = await db.rpc("email_activity", { p_days: days });
  if (error) throw new Error(`email_activity: ${error.message}`);
  return data as EmailActivity;
}

/** Draft email copy from a short brief, using the local Ollama model on the
 *  Signals host (via the admin-gated email-compose function). Preview, then accept. */
export interface ComposedEmail {
  subject: string; preheader: string; eyebrow: string;
  heading: string; intro: string; body: string; cta_label: string; footer: string;
}
export async function composeEmail(brief: string): Promise<ComposedEmail> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("email-compose", { body: { brief } });
  if (error) {
    // The function returns a structured {error, detail} body on 4xx/5xx.
    let detail = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") { const b = await ctx.json(); detail = b?.detail ?? b?.error ?? detail; }
    } catch { /* fall back to error.message */ }
    throw new Error(detail);
  }
  if (!data?.draft) throw new Error("Drafting returned nothing.");
  return data.draft as ComposedEmail;
}

/** AI voice check — critique draft copy against the live voice guide, via the
 *  admin-gated voice-check function (Ollama on the Signals host). On-demand;
 *  the editor keeps its instant heuristic for live feedback. */
export interface VoiceReview {
  on_voice: boolean;
  score: number; // 0–100
  deviations: string[];
  rewrites: { before: string; after: string }[];
  summary: string;
}
export async function checkVoice(text: string): Promise<VoiceReview> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("voice-check", { body: { text } });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") { const b = await ctx.json(); detail = b?.detail ?? b?.error ?? detail; }
    } catch { /* fall back to error.message */ }
    throw new Error(detail);
  }
  if (!data?.review) throw new Error("Voice check returned nothing.");
  const r = data.review as Partial<VoiceReview>;
  return {
    on_voice: !!r.on_voice,
    score: typeof r.score === "number" ? r.score : 0,
    deviations: Array.isArray(r.deviations) ? r.deviations : [],
    rewrites: Array.isArray(r.rewrites) ? r.rewrites : [],
    summary: r.summary ?? "",
  };
}

// ---- Custom scheduled emails -----------------------------------------------

/** Create a new custom email template (admin-composed body). Returns its key. */
export async function createCustomEmail(
  fields: { label: string } & Partial<EmailTemplate>,
): Promise<string> {
  const db = getClient();
  const me = (await db.auth.getUser()).data.user?.email ?? null;
  // Stable, collision-resistant key from the label + a random suffix.
  const slug = fields.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "email";
  const key = `custom_${slug}_${Math.random().toString(36).slice(2, 7)}`;
  const { error } = await db.from("email_templates").insert({
    email_key: key, is_custom: true, label: fields.label,
    eyebrow: fields.eyebrow ?? "FounderFirst",
    subject: fields.subject ?? "", preheader: fields.preheader ?? "",
    heading: fields.heading ?? "", intro: fields.intro ?? "",
    cta_label: fields.cta_label ?? "", footer: fields.footer ?? "",
    body: fields.body ?? "", updated_by: me,
  });
  if (error) throw new Error(error.message);
  void logAudit("email.custom.create", "email_template", key, { label: fields.label });
  return key;
}

export async function deleteCustomEmail(key: string): Promise<void> {
  const db = getClient();
  const { error } = await db.from("email_templates").delete().eq("email_key", key);
  if (error) throw new Error(error.message);
  void logAudit("email.custom.delete", "email_template", key, {});
}

export async function listEmailSchedules(): Promise<EmailSchedule[]> {
  const db = getClient();
  const { data, error } = await db.from("email_schedules")
    .select("*").order("created_at", { ascending: false });
  if (error) throw new Error(`listEmailSchedules: ${error.message}`);
  return (data as EmailSchedule[]) ?? [];
}

export async function upsertEmailSchedule(s: Partial<EmailSchedule> & { email_key: string }): Promise<void> {
  const db = getClient();
  const me = (await db.auth.getUser()).data.user?.email ?? null;
  const row = { ...s, created_by: me, updated_at: new Date().toISOString() };
  const { error } = s.id
    ? await db.from("email_schedules").update(row).eq("id", s.id)
    : await db.from("email_schedules").insert(row);
  if (error) throw new Error(error.message);
  void logAudit("email.schedule.save", "email_schedule", s.id ?? s.email_key, {});
}

export async function deleteEmailSchedule(id: string): Promise<void> {
  const db = getClient();
  const { error } = await db.from("email_schedules").delete().eq("id", id);
  if (error) throw new Error(error.message);
  void logAudit("email.schedule.delete", "email_schedule", id, {});
}

/** Send a single test of an email (built-in or custom). Defaults to your inbox. */
export async function sendTestEmail(key: string, to?: string, ctaHref?: string): Promise<{ sent: number }> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("email-test", {
    body: { key, to, cta_href: ctaHref },
  });
  if (error) throw new Error(`sendTestEmail: ${error.message}`);
  return data as { sent: number };
}

export interface DiscordLinkRow {
  id: string;
  email_normalized: string;
  discord_user_id: string | null;
  discord_username: string | null;
  discord_channel_id: string | null;
  initiated_from: "discord" | "web";
  status: "pending" | "confirmed" | "revoked";
  scopes: string[];
  created_at: string;
  confirmed_at: string | null;
  revoked_at: string | null;
}

export async function listDiscordLinks(search?: string): Promise<DiscordLinkRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("admin_list_discord_links", {
    p_limit: 200,
    p_search: search?.trim() || null,
  });
  if (error) throw new Error(`listDiscordLinks: ${error.message}`);
  return (data as DiscordLinkRow[]) ?? [];
}

export async function revokeDiscordLink(opts: { discord_user_id?: string | null; email?: string | null }): Promise<number> {
  const db = getClient();
  const { data, error } = await db.rpc("revoke_discord_link", {
    p_discord_user_id: opts.discord_user_id ?? null,
    p_email: opts.email ?? null,
  });
  if (error) throw new Error(`revokeDiscordLink: ${error.message}`);
  return (data as number) ?? 0;
}

/** Counts of rows removed by a full Discord erasure. */
export interface DiscordEraseResult { discord_user_id: string | null; messages: number; memory: number; links: number }

/** Right-to-erasure: hard-delete a user's Discord DMs, memory, and link row(s).
 *  Admin-gated server-side (admin_discord_erase). Irreversible — not /disconnect. */
export async function adminDiscordErase(opts: { discord_user_id?: string | null; email?: string | null }): Promise<DiscordEraseResult> {
  const db = getClient();
  const { data, error } = await db.rpc("admin_discord_erase", {
    p_discord_user_id: opts.discord_user_id ?? null,
    p_email: opts.email ?? null,
  });
  if (error) throw new Error(`adminDiscordErase: ${error.message}`);
  return data as unknown as DiscordEraseResult;
}

// ---- Types matching the RPC return shapes ----------------------------------

export interface TicketRow {
  id: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "p1" | "p2" | "p3";
  channel: "discord" | "web";
  subject: string;
  first_message: string;
  contact_email: string | null;
  contact_discord: string | null;
  topic: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface TicketMessage {
  id: string;
  author: "user" | "bot" | "admin";
  body: string;
  created_at: string;
}

export interface TicketDetail {
  ticket: {
    id: string;
    status: TicketRow["status"];
    priority: TicketRow["priority"];
    channel: TicketRow["channel"];
    channel_thread_ref: string;
    subject: string;
    first_message: string;
    topic: string | null;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    bot_confidence: string | null;
    bot_reason: string | null;
    contact_email: string | null;
    contact_discord: string | null;
  };
  messages: TicketMessage[];
}

// ---- RPC wrappers ----------------------------------------------------------

export async function listTickets(status?: TicketRow["status"]): Promise<TicketRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_tickets", { p_status: status ?? null });
  if (error) throw new Error(`list_tickets: ${error.message}`);
  return (data as TicketRow[]) ?? [];
}

export async function getTicket(ticketId: string): Promise<TicketDetail> {
  const db = getClient();
  const { data, error } = await db.rpc("get_ticket", { p_ticket_id: ticketId });
  if (error) throw new Error(`get_ticket: ${error.message}`);
  return data as TicketDetail;
}

export interface AnalyticsSnapshot {
  now: string;
  open_count: number;
  in_progress: number;
  stale_count: number;
  resolved_7d: number;
  opened_7d: number;
  avg_first_response_minutes_7d: number | null;
  opens_by_day: Array<{ day: string; count: number }>;
  resolves_by_day: Array<{ day: string; count: number }>;
  channel_30d: Partial<Record<"discord" | "web", number>>;
  priority_30d: Partial<Record<"p1" | "p2" | "p3", number>>;
  topic_30d: Record<string, number>;
  csat_7d: { up: number; down: number; count: number; score_pct: number | null };
}

export interface FeedbackRow {
  id: string;
  source: "bot_resolved" | "admin_resolved";
  rating: "up" | "down";
  comment: string | null;
  channel: "discord" | "web" | null;
  ticket_id: string | null;
  ticket_subject: string | null;
  created_at: string;
}

export interface TicketFeedback {
  id: string;
  source: "bot_resolved" | "admin_resolved";
  rating: "up" | "down";
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export async function listRecentFeedback(limit = 20): Promise<FeedbackRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_recent_feedback", { p_limit: limit });
  if (error) throw new Error(`list_recent_feedback: ${error.message}`);
  return (data as FeedbackRow[]) ?? [];
}

export async function getFeedbackForTicket(ticketId: string): Promise<TicketFeedback | null> {
  const db = getClient();
  const { data, error } = await db.rpc("get_feedback_for_ticket", { p_ticket_id: ticketId });
  if (error) throw new Error(`get_feedback_for_ticket: ${error.message}`);
  return (data as TicketFeedback | null) ?? null;
}

export async function getAnalytics(): Promise<AnalyticsSnapshot> {
  const db = getClient();
  const { data, error } = await db.rpc("get_analytics");
  if (error) throw new Error(`get_analytics: ${error.message}`);
  return data as AnalyticsSnapshot;
}

export async function setTicketTopic(ticketId: string, topic: string | null): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("set_ticket_topic", {
    p_ticket_id: ticketId,
    p_topic: topic ?? "",
  });
  if (error) throw new Error(`set_ticket_topic: ${error.message}`);
}

// ---- Audit log -------------------------------------------------------------

export interface AuditRow {
  id: string;
  actor_email: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * Fire-and-forget audit write. We never want a logging failure to break a
 * user-visible action, so errors are swallowed (logged to console in dev).
 */
export async function logAudit(
  action: string,
  targetType: string | null = null,
  targetId: string | null = null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    const db = getClient();
    const { error } = await db.rpc("log_admin_action", {
      p_action:      action,
      p_target_type: targetType,
      p_target_id:   targetId,
      p_payload:     payload,
    });
    if (error) console.warn("[audit]", action, error.message);
  } catch (e) {
    console.warn("[audit]", action, e);
  }
}

export async function listAudit(
  filters: { action?: string; actor?: string; since?: string; limit?: number } = {},
): Promise<AuditRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("admin_list_audit", {
    p_action: filters.action ?? null,
    p_actor:  filters.actor ?? null,
    p_since:  filters.since ?? null,
    p_limit:  filters.limit ?? 200,
  });
  if (error) throw new Error(`admin_list_audit: ${error.message}`);
  return (data as AuditRow[]) ?? [];
}

export async function getAuditFacets(): Promise<{ actions: string[]; actors: string[] }> {
  const db = getClient();
  const { data, error } = await db.rpc("admin_audit_facets");
  if (error) throw new Error(`admin_audit_facets: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    actions: (row?.actions as string[]) ?? [],
    actors:  (row?.actors  as string[]) ?? [],
  };
}

// ---- Google Analytics 4 (via Supabase Edge Function) -----------------------

export interface GaOverview {
  totalUsers: number;
  sessions: number;
  pageViews: number;
  bounceRate: number;     // 0..1
  avgSessionSec: number;
}
export interface GaTrafficRow { date: string; sessions: number; users: number }
export interface GaPageRow    { path: string;  views: number;    users: number }
export interface GaSourceRow  { source: string; sessions: number; users: number }

async function callGaProxy<T>(body: Record<string, unknown>): Promise<T> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("ga-proxy", { body });
  if (error) throw new Error(`ga-proxy: ${error.message}`);
  if (data?.error) throw new Error(`ga-proxy: ${data.error}${data.hint ? ` (${data.hint})` : ""}`);
  return data as T;
}

export const ga = {
  overview:  (days = 30)              => callGaProxy<GaOverview>({ action: "overview",  days }),
  traffic:   (days = 30)              => callGaProxy<{ rows: GaTrafficRow[] }>({ action: "traffic",   days }),
  topPages:  (days = 30, limit = 10)  => callGaProxy<{ rows: GaPageRow[]    }>({ action: "topPages",  days, limit }),
  sources:   (days = 30, limit = 10)  => callGaProxy<{ rows: GaSourceRow[]  }>({ action: "sources",   days, limit }),
};

// ---- PostHog (product analytics via posthog-proxy → HogQL) ------------------
export interface PhOverview   { pageviews: number; users: number; sessions: number }
export interface PhTrafficRow { date: string; pageviews: number; users: number }
export interface PhPageRow    { path: string; views: number; users: number }
export interface PhEventRow   { event: string; count: number }

async function callPhProxy<T>(body: Record<string, unknown>): Promise<T> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("posthog-proxy", { body });
  if (error) throw new Error(`posthog-proxy: ${error.message}`);
  if (data?.error) throw new Error(`posthog-proxy: ${data.error}${data.hint ? ` (${data.hint})` : ""}`);
  return data as T;
}

export const posthog = {
  overview:  (days = 30)              => callPhProxy<PhOverview>({ action: "overview",  days }),
  traffic:   (days = 30)              => callPhProxy<{ rows: PhTrafficRow[] }>({ action: "traffic",   days }),
  topPages:  (days = 30, limit = 10)  => callPhProxy<{ rows: PhPageRow[]    }>({ action: "topPages",  days, limit }),
  topEvents: (days = 30, limit = 10)  => callPhProxy<{ rows: PhEventRow[]   }>({ action: "topEvents", days, limit }),
};

// ---- Product insights (learning loop: Synthesize + Act) --------------------

/** The three outcome areas a run can target. */
export type InsightGoal = "product" | "content" | "customer";
/** One real datapoint a finding is grounded in (no hallucinated numbers). */
export interface InsightEvidence { metric: string; value: number | string }

export interface InsightRunRow {
  id: string; window_days: number; summary: string; finding_count: number;
  open_actions: number; model: string | null; status: string; created_at: string;
  sources?: string[]; goals?: string[];
}
export interface InsightFinding {
  observation?: string; likely_cause?: string; suggested_action?: string; confidence?: string;
}
export interface InsightActionRow {
  id: string; run_id: string; title: string; observation: string; suggested_action: string;
  confidence: string | null; status: "suggested" | "accepted" | "dismissed" | "done";
  created_at: string; updated_at: string;
  theme?: InsightGoal | null; surface?: string | null; evidence?: InsightEvidence[];
  resulting_content_id?: string | null;  // set once routed to the content pipeline
}
export interface InsightRunDetail {
  run: {
    id: string; window_days: number; metrics: unknown; summary: string;
    findings: InsightFinding[]; model: string | null; status: string; created_at: string;
  };
  actions: InsightActionRow[];
}

export async function listInsightRuns(limit = 26): Promise<InsightRunRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_insight_runs", { p_limit: limit });
  if (error) throw new Error(`list_insight_runs: ${error.message}`);
  return (data ?? []) as InsightRunRow[];
}

export async function getInsightRun(id: string): Promise<InsightRunDetail | null> {
  const db = getClient();
  const { data, error } = await db.rpc("get_insight_run", { p_id: id });
  if (error) throw new Error(`get_insight_run: ${error.message}`);
  return (data ?? null) as InsightRunDetail | null;
}

/** Kick off a synthesis run over the chosen sources + goals (real data → grounded findings). */
export async function generateInsights(
  params: { days?: number; sources: string[]; goals: InsightGoal[] },
): Promise<{ run_id: string; finding_count: number; dropped?: number }> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("synthesize-insights", {
    body: { days: params.days ?? 30, sources: params.sources, goals: params.goals },
  });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") { const b = await ctx.json(); detail = b?.detail ?? b?.error ?? detail; }
    } catch { /* fall back */ }
    throw new Error(detail);
  }
  if (!data?.run_id) throw new Error("Synthesis returned nothing.");
  return data as { run_id: string; finding_count: number; dropped?: number };
}

export async function setInsightActionStatus(id: string, status: InsightActionRow["status"]): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("set_insight_action_status", { p_id: id, p_status: status });
  if (error) throw new Error(`set_insight_action_status: ${error.message}`);
}

/** Content surfaces whose insight actions can be routed into the content pipeline. */
export const CONTENT_SURFACES = new Set(["blog", "podcast", "social"]);

/**
 * Route an insight action into the content pipeline as a new 'idea'. Links the
 * action back via resulting_content_id (closes the learning loop). Returns the
 * new content_pipeline row id.
 */
export async function createContentPipelineItem(params: {
  source: "insight" | "manual" | "signal";
  topic: string;
  angle?: string | null;
  grounding?: unknown;
  sourceRef?: string | null;
}): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("create_content_pipeline_item", {
    p_source: params.source,
    p_topic: params.topic,
    p_angle: params.angle ?? null,
    p_grounding: params.grounding ?? {},
    p_source_ref: params.sourceRef ?? null,
  });
  if (error) throw new Error(`create_content_pipeline_item: ${error.message}`);
  return data as string;
}

// ---- Product funnel --------------------------------------------------------

export interface FunnelStageRow { stage: string; unique_users: number; total_events: number }
export interface EventsDailyRow { day: string; total: number; identified: number }

export async function getFunnel(days = 30): Promise<FunnelStageRow[]> {
  const db = getClient();
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const { data, error } = await db.rpc("admin_funnel", { p_since: since });
  if (error) throw new Error(`admin_funnel: ${error.message}`);
  return ((data as FunnelStageRow[]) ?? []).map((r) => ({
    stage: r.stage,
    unique_users: Number(r.unique_users),
    total_events: Number(r.total_events),
  }));
}

export async function getEventsDaily(days = 30): Promise<EventsDailyRow[]> {
  const db = getClient();
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const { data, error } = await db.rpc("admin_events_daily", { p_since: since });
  if (error) throw new Error(`admin_events_daily: ${error.message}`);
  return ((data as EventsDailyRow[]) ?? []).map((r) => ({
    day: r.day,
    total: Number(r.total),
    identified: Number(r.identified),
  }));
}

// ---- Users / Waitlist ------------------------------------------------------

export interface WaitlistRow {
  row_data: Record<string, unknown>;
  signed_up_at: string;
}

export interface WaitlistDailyRow { day: string; signups: number }
export interface WaitlistSourceRow { source: string; signups: number }
export interface WaitlistLeaderRow { referrer_slug: string; referrer_email: string | null; referred_count: number }

export async function getWaitlistDaily(days = 30): Promise<WaitlistDailyRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("admin_waitlist_daily", { p_days: days });
  if (error) throw new Error(`admin_waitlist_daily: ${error.message}`);
  return ((data as WaitlistDailyRow[]) ?? []).map((r) => ({ day: r.day, signups: Number(r.signups) }));
}

export async function getWaitlistSources(): Promise<WaitlistSourceRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("admin_waitlist_sources");
  if (error) throw new Error(`admin_waitlist_sources: ${error.message}`);
  return ((data as WaitlistSourceRow[]) ?? []).map((r) => ({ source: r.source, signups: Number(r.signups) }));
}

export async function getWaitlistLeaderboard(limit = 10): Promise<WaitlistLeaderRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("admin_waitlist_leaderboard", { p_limit: limit });
  if (error) throw new Error(`admin_waitlist_leaderboard: ${error.message}`);
  return ((data as WaitlistLeaderRow[]) ?? []).map((r) => ({
    referrer_slug: r.referrer_slug,
    referrer_email: r.referrer_email,
    referred_count: Number(r.referred_count),
  }));
}

export async function listWaitlist(search?: string, limit = 500): Promise<WaitlistRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("admin_list_waitlist", {
    p_limit: limit,
    p_search: search?.trim() || null,
  });
  if (error) throw new Error(`admin_list_waitlist: ${error.message}`);
  return (data as WaitlistRow[]) ?? [];
}

export async function replyToTicket(
  ticketId: string,
  body: string,
  resolve: boolean,
): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("reply_to_ticket", {
    p_ticket_id: ticketId,
    p_body: body,
    p_resolve: resolve,
  });
  if (error) throw new Error(`reply_to_ticket: ${error.message}`);
  return data as string;
}

// ---- Penny prompts ---------------------------------------------------------

export interface PromptRow {
  id: string;
  version: number;
  body: string;
  notes: string | null;
  is_live: boolean;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
}

export interface LivePromptRow {
  id: string;
  version: number;
  body: string;
  updated_at: string;
}

export async function listPrompts(): Promise<PromptRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_prompts");
  if (error) throw new Error(`list_prompts: ${error.message}`);
  return ((data as PromptRow[]) ?? []).map((r) => ({
    ...r,
    version: Number(r.version),
  }));
}

export async function getLivePrompt(): Promise<LivePromptRow | null> {
  const db = getClient();
  const { data, error } = await db.rpc("get_live_prompt");
  if (error) throw new Error(`get_live_prompt: ${error.message}`);
  const rows = (data as LivePromptRow[]) ?? [];
  if (!rows.length) return null;
  return { ...rows[0], version: Number(rows[0].version) };
}

export async function createPromptVersion(
  body: string,
  notes?: string,
): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("create_prompt_version", {
    p_body: body,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(`create_prompt_version: ${error.message}`);
  return data as string;
}

export async function setLivePrompt(id: string): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("set_live_prompt", { p_id: id });
  if (error) throw new Error(`set_live_prompt: ${error.message}`);
}

// ---- Voice guide (shared across all surfaces) ------------------------------
//
// One canonical voice/tone guide (VOICE.md) prepended to every bot's system
// prompt. Same versioning model as penny_prompts.

export interface VoiceRow {
  id: string;
  version: number;
  body: string;
  notes: string | null;
  is_live: boolean;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
}

export interface LiveVoiceRow {
  id: string;
  version: number;
  body: string;
  updated_at: string;
}

export async function listVoice(): Promise<VoiceRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_voice");
  if (error) throw new Error(`list_voice: ${error.message}`);
  return ((data as VoiceRow[]) ?? []).map((r) => ({ ...r, version: Number(r.version) }));
}

export async function getLiveVoice(): Promise<LiveVoiceRow | null> {
  const db = getClient();
  const { data, error } = await db.rpc("get_live_voice");
  if (error) throw new Error(`get_live_voice: ${error.message}`);
  const rows = (data as LiveVoiceRow[]) ?? [];
  if (!rows.length) return null;
  return { ...rows[0], version: Number(rows[0].version) };
}

export async function createVoiceVersion(body: string, notes?: string): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("create_voice_version", {
    p_body: body,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(`create_voice_version: ${error.message}`);
  return data as string;
}

export async function setLiveVoice(id: string): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("set_live_voice", { p_id: id });
  if (error) throw new Error(`set_live_voice: ${error.message}`);
}

// ── Discord persona — the bot's editable instruction block. Same model as
// penny_voice; consumed live by the Worker (buildDiscordSystemPrompt).
export interface DiscordPersonaRow {
  id: string;
  version: number;
  body: string;
  notes: string | null;
  is_live: boolean;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
}

export async function listDiscordPersona(): Promise<DiscordPersonaRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_discord_persona");
  if (error) throw new Error(`list_discord_persona: ${error.message}`);
  return ((data as DiscordPersonaRow[]) ?? []).map((r) => ({ ...r, version: Number(r.version) }));
}

export async function createDiscordPersonaVersion(body: string, notes?: string): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("create_discord_persona_version", {
    p_body: body,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(`create_discord_persona_version: ${error.message}`);
  return data as string;
}

export async function setLiveDiscordPersona(id: string): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("set_live_discord_persona", { p_id: id });
  if (error) throw new Error(`set_live_discord_persona: ${error.message}`);
}

// ---- Site content (unified content model — Phase 1) ------------------------
// Versioned page + email content, same model as penny_voice. RPCs are
// admin-gated server-side (is_admin) and audited via log_admin_action.
// See migration 20260624110000_content_model.sql + @ff/content for the schema.

export interface PageSummaryRow { slug: string; surface: string; version: number; is_live: boolean; updated_at: string; }
export interface ContentVersionRow {
  id: string;
  version: number;
  payload: unknown;
  notes: string | null;
  is_live: boolean;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
}

export async function listContentPages(): Promise<PageSummaryRow[]> {
  if (CONTENT_MOCK) return mockContent.listContentPages();
  const db = getClient();
  const { data, error } = await db.rpc("list_content_pages");
  if (error) throw new Error(`list_content_pages: ${error.message}`);
  return ((data as PageSummaryRow[]) ?? []).map((r) => ({ ...r, version: Number(r.version) }));
}

export async function listPageVersions(slug: string): Promise<ContentVersionRow[]> {
  if (CONTENT_MOCK) return mockContent.listPageVersions();
  const db = getClient();
  const { data, error } = await db.rpc("list_page_versions", { p_slug: slug });
  if (error) throw new Error(`list_page_versions: ${error.message}`);
  return ((data as ContentVersionRow[]) ?? []).map((r) => ({ ...r, version: Number(r.version) }));
}

export async function createPageVersion(
  slug: string, surface: string, payload: unknown, notes?: string,
): Promise<string> {
  if (CONTENT_MOCK) return mockContent.createPageVersion(slug, surface, payload, notes);
  const db = getClient();
  const { data, error } = await db.rpc("create_page_version", {
    p_slug: slug, p_surface: surface, p_payload: payload, p_notes: notes ?? null,
  });
  if (error) throw new Error(`create_page_version: ${error.message}`);
  return data as string;
}

export async function setLivePage(id: string): Promise<void> {
  if (CONTENT_MOCK) return mockContent.setLivePage(id);
  const db = getClient();
  const { error } = await db.rpc("set_live_page", { p_id: id });
  if (error) throw new Error(`set_live_page: ${error.message}`);
}

// ---- Blog posts (admin-editable content model) -----------------------------
// Versioned blog posts, same pattern as content_pages. RPCs admin-gated server-
// side (is_admin) + audited. See migration 20260627121000_blog_posts.sql.

export interface BlogSummaryRow { slug: string; title: string; date: string; version: number; is_live: boolean; updated_at: string; }
export interface BlogVersionRow {
  id: string; version: number; payload: unknown; notes: string | null;
  is_live: boolean; created_at: string; created_by: string | null; created_by_email: string | null;
}

export async function listBlogPosts(): Promise<BlogSummaryRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_blog_posts");
  if (error) throw new Error(`list_blog_posts: ${error.message}`);
  return ((data as BlogSummaryRow[]) ?? []).map((r) => ({ ...r, version: Number(r.version) }));
}

export async function listBlogPostVersions(slug: string): Promise<BlogVersionRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_blog_post_versions", { p_slug: slug });
  if (error) throw new Error(`list_blog_post_versions: ${error.message}`);
  return ((data as BlogVersionRow[]) ?? []).map((r) => ({ ...r, version: Number(r.version) }));
}

export async function createBlogPostVersion(slug: string, payload: unknown, notes?: string): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("create_blog_post_version", {
    p_slug: slug, p_payload: payload, p_notes: notes ?? null,
  });
  if (error) throw new Error(`create_blog_post_version: ${error.message}`);
  return data as string;
}

export async function setLiveBlogPost(id: string): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("set_live_blog_post", { p_id: id });
  if (error) throw new Error(`set_live_blog_post: ${error.message}`);
}

// ---- Signals (social listening + outreach) ---------------------------------
// All RPCs are admin-gated server-side (is_admin) and audited via
// log_admin_action. Mirrors the ticket wrappers above. See SIGNALS_SOLUTION.md.

export interface SigItemRow {
  id: string;
  platform: string;
  external_url: string | null;
  author_handle: string | null;
  title: string | null;
  body: string | null;
  posted_at: string | null;
  captured_via: string;
  status: "pending" | "scoring" | "scored" | "archived" | "promoted";
  captured_at: string;
  relevance: number | null;
  intent: number | null;
  pain_tags: string[] | null;
  competitor: string | null;
  geo: string | null;   // 'us' | 'non_us' | 'unknown' — present once list_sig_items returns it
  role: string | null;  // 'needs_help' | 'offering_services' | 'hiring' | 'other'
}

export interface SigLeadRow {
  id: string;
  item_id: string;
  stage: "new" | "reviewing" | "drafted" | "sent" | "replied" | "won" | "dead";
  channel: "on_platform" | "email";
  platform: string;
  author_handle: string | null;
  external_url: string | null;
  title: string | null;
  intent: number | null;
  competitor: string | null;
  has_draft: boolean;
  sent_at: string | null;
  created_at: string;
}

export interface SigKeywordRow {
  id: string;
  term: string;
  kind: "pain" | "competitor";
  enabled: boolean;
  created_at: string;
}

export interface SigSourceRow {
  id: string;
  platform: string;
  query: string | null;
  captured_via: string;
  enabled: boolean;
  cadence_minutes: number | null;
  last_polled_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function upsertSigSource(s: {
  id?: string;
  platform: string;
  query: string | null;
  captured_via?: string;
  enabled?: boolean;
  cadence_minutes?: number | null;
}): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("upsert_sig_source", {
    p_platform: s.platform,
    p_query: s.query,
    p_captured_via: s.captured_via ?? "api_direct",
    p_enabled: s.enabled ?? true,
    p_cadence_minutes: s.cadence_minutes ?? null,
    p_id: s.id ?? null,
  });
  if (error) throw new Error(`upsert_sig_source: ${error.message}`);
  return data as string;
}

export async function deleteSigSource(id: string): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("delete_sig_source", { p_id: id });
  if (error) throw new Error(`delete_sig_source: ${error.message}`);
}

export async function listSigSourceCounts(): Promise<Record<string, number>> {
  const db = getClient();
  const { data, error } = await db.rpc("sig_source_counts");
  if (error) throw new Error(`sig_source_counts: ${error.message}`);
  const m: Record<string, number> = {};
  for (const r of (data as Array<{ source_id: string; n: number }>) ?? []) m[r.source_id] = Number(r.n);
  return m;
}

export const SIG_STAGES: SigLeadRow["stage"][] = [
  "new", "reviewing", "drafted", "sent", "replied", "won", "dead",
];

export async function listSigItems(opts: {
  status?: string | null;
  platform?: string | null;
  minIntent?: number | null;
  limit?: number;
} = {}): Promise<SigItemRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_sig_items", {
    p_status: opts.status ?? null,
    p_platform: opts.platform ?? null,
    p_min_intent: opts.minIntent ?? null,
    p_limit: opts.limit ?? 200,
  });
  if (error) throw new Error(`list_sig_items: ${error.message}`);
  return (data as SigItemRow[]) ?? [];
}

export async function listSigLeads(stage?: string | null): Promise<SigLeadRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_sig_leads", {
    p_stage: stage ?? null,
    p_limit: 200,
  });
  if (error) throw new Error(`list_sig_leads: ${error.message}`);
  return (data as SigLeadRow[]) ?? [];
}

export async function getSigLead(leadId: string): Promise<any> {
  const db = getClient();
  const { data, error } = await db.rpc("get_sig_lead", { p_lead_id: leadId });
  if (error) throw new Error(`get_sig_lead: ${error.message}`);
  return data;
}

export async function updateSigLeadStage(leadId: string, stage: string): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("update_sig_lead_stage", { p_lead_id: leadId, p_stage: stage });
  if (error) throw new Error(`update_sig_lead_stage: ${error.message}`);
}

export async function saveSigLeadDraft(leadId: string, draft: string): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("save_sig_lead_draft", { p_lead_id: leadId, p_draft: draft });
  if (error) throw new Error(`save_sig_lead_draft: ${error.message}`);
}

export async function markSigLeadSent(leadId: string, channel = "on_platform"): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("mark_sig_lead_sent", { p_lead_id: leadId, p_channel: channel });
  if (error) throw new Error(`mark_sig_lead_sent: ${error.message}`);
}

export async function saveSigLeadCard(input: {
  leadId: string;
  stage: string;
  draft: string;
  contactName: string;
  contactCompany: string;
  contactEmail: string;
  contactDetails: string;
  notes: string;
}): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("save_sig_lead_card", {
    p_lead_id: input.leadId,
    p_stage: input.stage,
    p_draft: input.draft || null,
    p_contact_name: input.contactName || null,
    p_contact_company: input.contactCompany || null,
    p_contact_email: input.contactEmail || null,
    p_contact_details: input.contactDetails || null,
    p_notes: input.notes || null,
  });
  if (error) throw new Error(`save_sig_lead_card: ${error.message}`);
}

// ---- Signals analytics (Analytics → Signals) -------------------------------

export interface SigPipeline {
  funnel: { ingested: number; scored: number; promoted: number; sent: number; replied: number; won: number };
  prev_promoted: number;
  needs_action: number;
  avg_days_to_send: number | null;
}

export async function getSigAnalyticsPipeline(days: number): Promise<SigPipeline> {
  const db = getClient();
  const { data, error } = await db.rpc("sig_analytics_pipeline", { p_days: days });
  if (error) throw new Error(`sig_analytics_pipeline: ${error.message}`);
  return data as SigPipeline;
}

export interface SigThemeExample {
  title: string | null;
  snippet: string;
  url: string | null;
  platform: string;
  ts: string;
  pains: string[] | null;
  competitor: string | null;
}

export interface SigThemes {
  pains: Array<{ tag: string; count: number; prev: number }>;
  competitors: Array<{ name: string; count: number; prev: number }>;
  platforms: Array<{ platform: string; count: number }>;
  buckets: Array<{ bucket: string; count: number }>;
  examples: SigThemeExample[];
  total_posts: number;
}

export async function getSigAnalyticsThemes(days: number, gran: string): Promise<SigThemes> {
  const db = getClient();
  const { data, error } = await db.rpc("sig_analytics_themes", { p_days: days, p_gran: gran });
  if (error) throw new Error(`sig_analytics_themes: ${error.message}`);
  return data as SigThemes;
}

export async function quickAddSigItem(input: {
  platform: string;
  url?: string | null;
  title?: string | null;
  body?: string | null;
  authorHandle?: string | null;
  authorUrl?: string | null;
}): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("sig_quick_add_item", {
    p_platform: input.platform,
    p_external_url: input.url ?? null,
    p_title: input.title ?? null,
    p_body: input.body ?? null,
    p_author_handle: input.authorHandle ?? null,
    p_author_url: input.authorUrl ?? null,
  });
  if (error) throw new Error(`sig_quick_add_item: ${error.message}`);
  return data as string;
}

export async function listSigKeywords(): Promise<SigKeywordRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_sig_keywords");
  if (error) throw new Error(`list_sig_keywords: ${error.message}`);
  return (data as SigKeywordRow[]) ?? [];
}

export async function upsertSigKeyword(input: {
  term: string;
  kind: "pain" | "competitor";
  enabled?: boolean;
  id?: string | null;
}): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("upsert_sig_keyword", {
    p_term: input.term,
    p_kind: input.kind,
    p_enabled: input.enabled ?? true,
    p_id: input.id ?? null,
  });
  if (error) throw new Error(`upsert_sig_keyword: ${error.message}`);
  return data as string;
}

export async function addSigIcpExample(body: string): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("add_sig_icp_example", { p_body: body });
  if (error) throw new Error(`add_sig_icp_example: ${error.message}`);
  return data as string;
}

export async function listSigSources(): Promise<SigSourceRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_sig_sources");
  if (error) throw new Error(`list_sig_sources: ${error.message}`);
  return (data as SigSourceRow[]) ?? [];
}

export interface SigIcpExampleRow {
  id: string;
  body: string;
  has_embedding: boolean;
  created_at: string;
}

export async function listSigIcpExamples(): Promise<SigIcpExampleRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_sig_icp_examples");
  if (error) throw new Error(`list_sig_icp_examples: ${error.message}`);
  return (data as SigIcpExampleRow[]) ?? [];
}

export async function deleteSigIcpExample(id: string): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("delete_sig_icp_example", { p_id: id });
  if (error) throw new Error(`delete_sig_icp_example: ${error.message}`);
}

export interface SigScoringConfig {
  intent_threshold: number;     // 0–100
  relevance_threshold: number;  // 0–1
  relevance_floor: number;      // 0–1
}

const SCORING_DEFAULTS: SigScoringConfig = {
  intent_threshold: 55, relevance_threshold: 0.55, relevance_floor: 0.3,
};

export async function listSigSettings(): Promise<SigScoringConfig> {
  const db = getClient();
  const { data, error } = await db.rpc("list_sig_settings");
  if (error) throw new Error(`list_sig_settings: ${error.message}`);
  const cfg = { ...SCORING_DEFAULTS };
  for (const row of (data as Array<{ key: string; value: number }>) ?? []) {
    if (row.key in cfg) (cfg as any)[row.key] = Number(row.value);
  }
  return cfg;
}

export async function setSigSetting(key: keyof SigScoringConfig, value: number): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("set_sig_setting", { p_key: key, p_value: value });
  if (error) throw new Error(`set_sig_setting: ${error.message}`);
}

// The daily sourcing optimizer writes its run report to sig_settings under
// 'optimizer_last_run' (a JSON blob). This reads it for the Scoring tab.
export interface SigOptimizerReport {
  ran_at: string;
  summary: string;
  items_analyzed: number;
  disabled: Array<{ platform: string; query: string; yield: number; n: number }>;
  proposed: Array<{ platform: string; query: string; hit_rate: number }>;
  pain_themes: Array<{ tag: string; count: number }>;
  threshold_suggestions: string[];
  leaderboard: Array<{ platform: string; query: string; yield: number; n: number; promoted: number; us_rate: number; needs_rate: number }>;
}

export async function getOptimizerReport(): Promise<SigOptimizerReport | null> {
  const db = getClient();
  const { data, error } = await db.rpc("list_sig_settings");
  if (error) throw new Error(`list_sig_settings: ${error.message}`);
  const row = ((data as Array<{ key: string; value: unknown }>) ?? []).find((r) => r.key === "optimizer_last_run");
  return row ? (row.value as SigOptimizerReport) : null;
}
