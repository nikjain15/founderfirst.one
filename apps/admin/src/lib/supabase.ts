/**
 * Supabase client + ticket RPC wrappers.
 *
 * RPCs called here all require an authenticated session (see SCHEMA.sql).
 * Magic-link login happens in Login.tsx; the resulting JWT travels with
 * every RPC call automatically once the client is initialized.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, hasSupabase } from "./env";

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
