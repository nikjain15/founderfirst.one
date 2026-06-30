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

export type AdminTier = "viewer" | "editor" | "super";

export interface AdminRow {
  email: string;
  added_at: string;
  added_by: string | null;
  is_super: boolean;
  role: AdminTier;
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
    .select("email, added_at, added_by, is_super, role")
    .order("added_at", { ascending: true });
  if (error) throw new Error(`listAdmins: ${error.message}`);
  return (data as AdminRow[]) ?? [];
}

export async function inviteAdmin(email: string, role: AdminTier = "viewer"): Promise<{ emailed: boolean }> {
  const db = getClient();
  const target = email.trim().toLowerCase();
  const me = (await db.auth.getUser()).data.user?.email ?? null;
  const { error } = await db
    .from("admins")
    .insert({ email: target, added_by: me, role });
  if (error) throw new Error(error.message);
  // Best-effort welcome email — the new admin gets a "you have access, here's
  // how to sign in" note. A send failure must never fail the add itself.
  try {
    const { data } = await db.functions.invoke("admin-welcome", { body: { email: target } });
    return { emailed: !!(data as { sent?: number } | null)?.sent };
  } catch {
    return { emailed: false };
  }
}

export async function removeAdmin(email: string): Promise<void> {
  const db = getClient();
  const { error } = await db.from("admins").delete().eq("email", email);
  if (error) throw new Error(error.message);
}

/** Change an admin's tier. Super-only (enforced by the admins_update_super RLS
 *  policy); editors/viewers get a row-level rejection. Promoting to 'super' is
 *  therefore only possible for an existing super. */
export async function setAdminRole(email: string, role: AdminTier): Promise<void> {
  const db = getClient();
  const { error } = await db.from("admins").update({ role }).eq("email", email);
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
  judge_cost_usd: number | null;     // Phase 2
  judge_cost_pct: number | null;     // Phase 2
  judged_count: number | null;       // Phase 2
  gate_passed: number | null;        // Phase 2
  gate_blocked: number | null;       // Phase 2
  gate_escalated: number | null;     // Phase 2
  gate_failed_closed: number | null; // Phase 2
  zero_edit_pct: number | null;      // Phase 3
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
  judge_cost: number | string | null;  // Phase 2
  gate_passed: number | null;          // Phase 2
  gate_blocked: number | null;         // Phase 2
  gate_escalated: number | null;       // Phase 2
  gate_failed_closed: number | null;   // Phase 2
  judged: number | null;               // Phase 2
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

// ---- AI eval config (Phase 2) ----------------------------------------------

export interface AIUseCase {
  use_case: string;
  label: string;
  customer_facing: boolean;
  financial: boolean;
}

export interface AILibraryEval {
  key: string;
  version: number;
  name: string;
  description: string | null;
  method: "deterministic" | "sql_reconciliation" | "llm_judge" | "classifier";
  kind: "gate" | "score";
  mandatory: boolean;
  floor_customer: boolean;
  floor_financial: boolean;
  judge_criteria: string | null;
  default_threshold: number | string | null;
  check_ref: string | null;
}

export interface AIUseCaseEval {
  eval_key: string;
  name: string;
  description: string | null;
  method: AILibraryEval["method"];
  library_kind: "gate" | "score";
  effective_kind: "gate" | "score";
  mandatory: boolean;
  is_floor: boolean;
  enabled: boolean;
  kind_override: "gate" | "score" | null;
  default_threshold: number | string | null;
  threshold_override: number | string | null;
  effective_threshold: number | string | null;
  sample_rate: number | string;
  position: number;
  panel_policy: Record<string, unknown>;
  eval_version: number;
}

export async function getAIUseCases(): Promise<AIUseCase[]> {
  const { data, error } = await getClient().rpc("admin_ai_use_cases");
  if (error) throw new Error(`getAIUseCases: ${error.message}`);
  return (data as AIUseCase[]) ?? [];
}

export async function getAIEvalLibrary(): Promise<AILibraryEval[]> {
  const { data, error } = await getClient().rpc("admin_ai_eval_library");
  if (error) throw new Error(`getAIEvalLibrary: ${error.message}`);
  return (data as AILibraryEval[]) ?? [];
}

export async function getAIUseCaseEvals(useCase: string): Promise<AIUseCaseEval[]> {
  const { data, error } = await getClient().rpc("admin_ai_usecase_evals", { p_use_case: useCase });
  if (error) throw new Error(`getAIUseCaseEvals: ${error.message}`);
  return (data as AIUseCaseEval[]) ?? [];
}

export async function setAIUseCaseEval(args: {
  useCase: string;
  evalKey: string;
  enabled?: boolean;
  kindOverride?: "gate" | "score" | "" | null;
  thresholdOverride?: number | null;
  sampleRate?: number | null;
  position?: number | null;
  panelPolicy?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await getClient().rpc("admin_ai_eval_set", {
    p_use_case: args.useCase,
    p_eval_key: args.evalKey,
    p_enabled: args.enabled ?? null,
    p_kind_override: args.kindOverride ?? null,
    p_threshold_override: args.thresholdOverride ?? null,
    p_sample_rate: args.sampleRate ?? null,
    p_position: args.position ?? null,
    p_panel_policy: args.panelPolicy ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function attachAIEval(useCase: string, evalKey: string, position = 100): Promise<void> {
  const { error } = await getClient().rpc("admin_ai_eval_attach", { p_use_case: useCase, p_eval_key: evalKey, p_position: position });
  if (error) throw new Error(error.message);
}

export async function detachAIEval(useCase: string, evalKey: string): Promise<void> {
  const { error } = await getClient().rpc("admin_ai_eval_detach", { p_use_case: useCase, p_eval_key: evalKey });
  if (error) throw new Error(error.message);
}

/* ---- Phase 4: model / routing / caps / caching config (admin_ai_model_*) ---- */

export interface AIModelConfigRow {
  use_case: string;
  label: string;
  runtime: string;
  main_provider: string;
  main_model: string;
  backup_provider: string | null;
  backup_model: string | null;
  cache_enabled: boolean;
  monthly_cap_usd: number | string | null;
  spend_mtd_usd: number | string | null;
  customer_facing: boolean;
  financial: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export interface AIModelPrice {
  model: string;
  provider: string;
  input_per_mtok: number | string;
  output_per_mtok: number | string;
  updated_at: string | null;
}

export async function getAIModelConfig(): Promise<AIModelConfigRow[]> {
  const { data, error } = await getClient().rpc("admin_ai_model_config");
  if (error) throw new Error(`getAIModelConfig: ${error.message}`);
  return (data as AIModelConfigRow[]) ?? [];
}

export async function getAIModels(): Promise<AIModelPrice[]> {
  const { data, error } = await getClient().rpc("admin_ai_models");
  if (error) throw new Error(`getAIModels: ${error.message}`);
  return (data as AIModelPrice[]) ?? [];
}

export async function setAIModelConfig(args: {
  useCase: string;
  mainProvider: string;
  mainModel: string;
  backupProvider?: string | null;
  backupModel?: string | null;
  cacheEnabled?: boolean | null;
  monthlyCapUsd?: number | null;
}): Promise<void> {
  const { error } = await getClient().rpc("admin_ai_model_config_set", {
    p_use_case: args.useCase,
    p_main_provider: args.mainProvider,
    p_main_model: args.mainModel,
    p_backup_provider: args.backupProvider ?? null,
    p_backup_model: args.backupModel ?? null,
    p_cache_enabled: args.cacheEnabled ?? null,
    p_monthly_cap_usd: args.monthlyCapUsd ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function setAIPrice(args: {
  model: string;
  provider: string;
  inputPerMTok: number;
  outputPerMTok: number;
}): Promise<void> {
  const { error } = await getClient().rpc("admin_ai_price_set", {
    p_model: args.model,
    p_provider: args.provider,
    p_input_per_mtok: args.inputPerMTok,
    p_output_per_mtok: args.outputPerMTok,
  });
  if (error) throw new Error(error.message);
}

/* ---- Phase 5: model catalog (ai_model_catalog) — the browsable universe -------- */

export interface AICatalogRow {
  model: string;
  provider: string;
  display_name: string | null;
  description: string | null;
  context_length: number | null;
  input_per_mtok: number | string | null;
  output_per_mtok: number | string | null;
  modalities: string[] | null;
  capabilities: Record<string, unknown> | null;
  benchmarks: Record<string, unknown> | null;
  intelligence: number | string | null;
  elo: number | string | null;
  task_tag: string | null;
  recommended_for: string[] | null;
  routable: boolean;
  source: string;
  synced_at: string | null;
}

export async function getAICatalog(filter?: { provider?: string; recommendedFor?: string }): Promise<AICatalogRow[]> {
  const { data, error } = await getClient().rpc("admin_ai_catalog", {
    p_provider: filter?.provider ?? null,
    p_recommended_for: filter?.recommendedFor ?? null,
    p_limit: 500,
  });
  if (error) throw new Error(`getAICatalog: ${error.message}`);
  return (data as AICatalogRow[]) ?? [];
}

export async function syncAICatalog(): Promise<Record<string, unknown>> {
  const { data, error } = await getClient().functions.invoke("ai-catalog-sync", { body: {} });
  if (error) throw new Error(`syncAICatalog: ${error.message}`);
  return (data as Record<string, unknown>) ?? {};
}

/* ---- Phase 5: autonomy ramp (review level per use case, D5) -------------------- */

export interface AIRampRow {
  use_case: string;
  label: string;
  current_mode: string;
  current_sample_rate: number | string;
  recommended_mode: string;
  recommended_sample_rate: number | string;
  decisions: number;
  reviewed: number;
  zero_edit_pct: number | string | null;
  gate_pass_pct: number | string | null;
  safety_fail: number;
  rationale: string;
}

export async function getRampRecommendations(days = 30): Promise<AIRampRow[]> {
  const { data, error } = await getClient().rpc("admin_ai_ramp_recommendations", { p_days: days });
  if (error) throw new Error(`getRampRecommendations: ${error.message}`);
  return (data as AIRampRow[]) ?? [];
}

export async function setReviewMode(useCase: string, mode: "full" | "sampling", sampleRate: number): Promise<void> {
  const { error } = await getClient().rpc("admin_ai_set_review_mode", {
    p_use_case: useCase,
    p_mode: mode,
    p_sample_rate: sampleRate,
  });
  if (error) throw new Error(error.message);
}

export async function upsertAIEval(args: {
  key: string;
  name: string;
  description: string;
  method: AILibraryEval["method"];
  kind: "gate" | "score";
  judgeCriteria?: string | null;
  defaultThreshold?: number | null;
  checkRef?: string | null;
}): Promise<number> {
  const { data, error } = await getClient().rpc("admin_ai_eval_upsert", {
    p_key: args.key,
    p_name: args.name,
    p_description: args.description,
    p_method: args.method,
    p_kind: args.kind,
    p_judge_criteria: args.judgeCriteria ?? null,
    p_default_threshold: args.defaultThreshold ?? null,
    p_check_ref: args.checkRef ?? null,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// ---- AI human review queue (Phase 3) ---------------------------------------
// Reads/writes ai_decisions verdict columns via is_admin()-gated RPCs. The queue
// surfaces gate-stops (blocked/escalated/failed_closed) + a D25 shadow sample of
// passed answers; a verdict captures zero_edit (the autonomy-ramp signal, D5).

export interface AIEvalResult {
  type: "gate" | "score";
  version: number;
  by: string;
  pass?: boolean;
  score?: number;
  rationale?: string;
  escalated?: boolean;
  votes?: Array<{ model: string; pass?: boolean; score?: number; reason?: string }>;
  latencyMs?: number;
  costUsd?: number;
}

export interface AIReviewItem {
  id: string;
  created_at: string;
  use_case: string;
  tenant_id: string;
  model: string;
  provider: string;
  gate_status: "passed" | "blocked" | "escalated" | "failed_closed" | "unevaluated";
  request_ref: string | null;
  input: { messages?: Array<{ role: string; content: string }> } | null;
  output: string | null;
  output_json: unknown;
  evals: Record<string, AIEvalResult>;
  cost_usd: number | string | null;
  judge_cost_usd: number | string | null;
  is_shadow: boolean;
}

export interface AIReviewKpis {
  window_days: number;
  awaiting: number;
  reviewed: number;
  approved_pct: number | null;
  zero_edit_pct: number | null;
}

export type AIReviewFilter = "needs" | "shadow" | "all";
export type AIReviewVerdict = "approved" | "approved_after_edit" | "rejected";

export async function getAIReviewQueue(filter: AIReviewFilter = "needs", limit = 50): Promise<AIReviewItem[]> {
  const { data, error } = await getClient().rpc("admin_ai_review_queue", { p_filter: filter, p_limit: limit });
  if (error) throw new Error(`getAIReviewQueue: ${error.message}`);
  return (data as AIReviewItem[]) ?? [];
}

export async function getAIReviewKpis(days = 30): Promise<AIReviewKpis | null> {
  const { data, error } = await getClient().rpc("admin_ai_review_kpis", { p_days: days });
  if (error) throw new Error(`getAIReviewKpis: ${error.message}`);
  return (data as AIReviewKpis) ?? null;
}

export async function submitAIReview(args: {
  id: string;
  verdict: AIReviewVerdict;
  edit?: Record<string, unknown> | string | null;
  reason?: string | null;
}): Promise<void> {
  const { error } = await getClient().rpc("admin_ai_review_submit", {
    p_id: args.id,
    p_verdict: args.verdict,
    p_edit: args.edit ?? null,
    p_reason: args.reason ?? null,
  });
  if (error) throw new Error(error.message);
}

// ---- Changelog ("What's new") ----------------------------------------------

export type ChangelogKind = "new" | "improved" | "fixed";

// Section buckets for the weekly digest. Keys must match the AREA registry in
// supabase/functions/changelog-digest/index.ts (the email groups by these).
export type ChangelogArea = "site" | "product" | "penny" | "reach" | "infra" | "general";

export const CHANGELOG_AREAS: { key: ChangelogArea; label: string }[] = [
  { key: "site",    label: "The site" },
  { key: "product", label: "The product" },
  { key: "penny",   label: "Smarter Penny" },
  { key: "reach",   label: "Reach + care" },
  { key: "infra",   label: "Under the hood" },
  { key: "general", label: "More" },
];

export interface ChangelogEntry {
  id: string;
  kind: ChangelogKind;
  area: ChangelogArea;
  title: string;
  body: string;
  created_at: string;
  created_by: string | null;
}

export async function listChangelog(): Promise<ChangelogEntry[]> {
  const db = getClient();
  const { data, error } = await db
    .from("changelog_entries")
    .select("id, kind, area, title, body, created_at, created_by")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listChangelog: ${error.message}`);
  return (data as ChangelogEntry[]) ?? [];
}

export async function addChangelogEntry(
  entry: { kind: ChangelogKind; area: ChangelogArea; title: string; body: string },
): Promise<ChangelogEntry> {
  const db = getClient();
  // created_by defaults to auth.email() in the DB; no need to pass it.
  const { data, error } = await db
    .from("changelog_entries")
    .insert({ kind: entry.kind, area: entry.area, title: entry.title.trim(), body: entry.body.trim() })
    .select("id, kind, area, title, body, created_at, created_by")
    .single();
  if (error) throw new Error(error.message);
  void logAudit("changelog.add", "changelog_entry", data.id, {
    kind: entry.kind,
    area: entry.area,
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

/**
 * Render this week's digest exactly as recipients would see it — sends nothing.
 * Pass `to` (comma/whitespace-separated emails) to preview against a specific
 * recipient list instead of all admins.
 */
export async function previewWeeklyDigest(to?: string): Promise<DigestPreview> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("changelog-digest", {
    body: { mode: "preview", ...(to ? { to } : {}) },
  });
  if (error) throw new Error(`previewWeeklyDigest: ${error.message}`);
  return data as DigestPreview;
}

/**
 * Send this week's digest. With no `to`, goes to all admins; pass `to`
 * (comma/whitespace-separated emails) to send only to specific people.
 */
export async function sendWeeklyDigest(to?: string): Promise<{ sent: number; entryCount: number }> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("changelog-digest", {
    body: { mode: "send", ...(to ? { to } : {}) },
  });
  if (error) throw new Error(`sendWeeklyDigest: ${error.message}`);
  void logAudit("changelog.send_digest", "changelog", null, {
    sent: data?.sent ?? 0,
    entries: data?.entryCount ?? 0,
    to: to || "all-admins",
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

// ---- Google Search Console (search visibility, via gsc-proxy) --------------

export interface GscSummary { clicks: number; impressions: number; ctr: number; position: number }
export interface GscDateRow  { date: string;  clicks: number; impressions: number; ctr: number; position: number }
export interface GscQueryRow { query: string; clicks: number; impressions: number; ctr: number; position: number }
export interface GscPageRow  { page: string;  clicks: number; impressions: number; ctr: number; position: number }

async function callGscProxy<T>(body: Record<string, unknown>): Promise<T> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("gsc-proxy", { body });
  if (error) throw new Error(`gsc-proxy: ${error.message}`);
  if (data?.error) throw new Error(`gsc-proxy: ${data.error}${data.hint ? ` (${data.hint})` : ""}`);
  return data as T;
}

export const gsc = {
  summary:     (days = 28)              => callGscProxy<GscSummary>({ action: "summary",    days }),
  byDate:      (days = 28)              => callGscProxy<{ rows: GscDateRow[]  }>({ action: "byDate",     days }),
  topQueries:  (days = 28, limit = 10)  => callGscProxy<{ rows: GscQueryRow[] }>({ action: "topQueries", days, limit }),
  topPages:    (days = 28, limit = 10)  => callGscProxy<{ rows: GscPageRow[]  }>({ action: "topPages",   days, limit }),
};

// ---- GEO / AI-answer visibility (citation tracking, via geo_summary RPC) ----

export interface GeoPromptStatus {
  prompt: string;
  topic: string | null;
  cited: boolean;
  mentioned: boolean;
  rank: number | null;              // best rank across engines that cited
  engines_cited: string[];          // which engines cited this prompt
}
export interface GeoEngineStat { engine: string; probes: number; cited: number; rate: number }
export interface GeoTrendRow    { date: string; cited: number; total: number; rate: number }
export interface GeoCompetitor  { name: string; count: number }
export interface GeoSummary {
  days: number;
  prompts_tracked: number;
  probes: number;                   // total (prompt × engine) probes in window
  cited_count: number;              // prompts cited by ANY engine
  mentioned_count: number;
  citation_rate: number;            // 0..1, per-prompt
  engines: GeoEngineStat[];         // per-engine breakdown (per-probe)
  prompts: GeoPromptStatus[];
  trend: GeoTrendRow[];
  competitors: GeoCompetitor[];
}

export async function getGeoSummary(days = 28): Promise<GeoSummary> {
  const db = getClient();
  const { data, error } = await db.rpc("geo_summary", { p_days: days });
  if (error) throw new Error(`geo_summary: ${error.message}`);
  return data as GeoSummary;
}

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

/** Per-product filter (undefined = all surfaces). Tagged via the `product`
 *  super-property on each surface's PostHog init. */
export type PhProduct = "website" | "demo" | "app" | "admin" | "chat";

export const posthog = {
  overview:  (days = 30, product?: PhProduct)             => callPhProxy<PhOverview>({ action: "overview",  days, product }),
  traffic:   (days = 30, product?: PhProduct)             => callPhProxy<{ rows: PhTrafficRow[] }>({ action: "traffic",   days, product }),
  topPages:  (days = 30, limit = 10, product?: PhProduct) => callPhProxy<{ rows: PhPageRow[]    }>({ action: "topPages",  days, limit, product }),
  topEvents: (days = 30, limit = 10, product?: PhProduct) => callPhProxy<{ rows: PhEventRow[]   }>({ action: "topEvents", days, limit, product }),
};

// ---- Learning loop "Act": experiments --------------------------------------
export type ExpStatus = "draft" | "running" | "stopped" | "promoted";
export type PolicyTier = "auto" | "propose" | "inform";
export interface ExperimentRow {
  id: string; key: string; name: string; status: ExpStatus; section_type: string;
  primary_metric: string; policy_tier: PolicyTier; created_at: string;
  started_at: string | null; stopped_at: string | null;
  winning_variant_key?: string | null; page_slug?: string;
}
export interface ArmRow {
  id: string; experiment_id: string; variant_key: string;
  payload: Record<string, unknown>; is_control: boolean; rollout_pct: number | null;
}
export interface ExpResultRow {
  variant_key: string; exposures: number; conversions: number;
  conv_rate: number | null; lift: number | null; as_of: string;
}

export const experiments = {
  list: async (): Promise<ExperimentRow[]> => {
    const db = getClient();
    const { data, error } = await db.from("experiments").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ExperimentRow[];
  },
  arms: async (experimentId: string): Promise<ArmRow[]> => {
    const db = getClient();
    const { data, error } = await db.from("experiment_arms").select("*").eq("experiment_id", experimentId).order("is_control", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ArmRow[];
  },
  results: async (experimentId: string): Promise<ExpResultRow[]> => {
    const db = getClient();
    const { data, error } = await db.from("experiment_results").select("variant_key, exposures, conversions, conv_rate, lift, as_of").eq("experiment_id", experimentId);
    if (error) throw new Error(error.message);
    return (data ?? []) as ExpResultRow[];
  },
  create: async (e: { key: string; name: string; section_type: string; policy_tier?: PolicyTier }): Promise<ExperimentRow> => {
    const db = getClient();
    const { data, error } = await db.from("experiments").insert({ key: e.key, name: e.name, section_type: e.section_type, policy_tier: e.policy_tier ?? "propose" }).select().single();
    if (error) throw new Error(error.message);
    return data as ExperimentRow;
  },
  addArm: async (a: { experiment_id: string; variant_key: string; payload: Record<string, unknown>; is_control?: boolean }): Promise<void> => {
    const db = getClient();
    const { error } = await db.from("experiment_arms").insert({ experiment_id: a.experiment_id, variant_key: a.variant_key, payload: a.payload, is_control: a.is_control ?? false });
    if (error) throw new Error(error.message);
  },
  setStatus: async (id: string, status: ExpStatus): Promise<void> => {
    const db = getClient();
    const patch: Record<string, unknown> = { status };
    if (status === "running") patch.started_at = new Date().toISOString();
    if (status === "stopped" || status === "promoted") patch.stopped_at = new Date().toISOString();
    const { error } = await db.from("experiments").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },
  /** AI-draft a variant — on-voice by construction (draft-variant reads the live Voice guide). */
  draft: async (field: string, control: string, brief?: string): Promise<string> => {
    const db = getClient();
    const { data, error } = await db.functions.invoke("draft-variant", { body: { field, control, brief } });
    if (error) throw new Error(`draft-variant: ${error.message}`);
    if (data?.error) throw new Error(`draft-variant: ${data.error}${data.detail ? ` — ${data.detail}` : ""}`);
    return String(data?.text ?? "");
  },
  /** Promote a winner: APPLY its section copy to the live content_pages row
   *  (new version → set live) so the site actually changes, then mark the
   *  experiment promoted. This closes the "promote ≠ publish" gap. */
  promoteWinner: async (exp: ExperimentRow, winning: ArmRow): Promise<void> => {
    const slug = exp.page_slug || "/";
    const versions = await listPageVersions(slug);
    const live = versions.find((v) => v.is_live);
    if (!live) throw new Error(`No live version for ${slug}`);
    const page: any = structuredClone(live.payload);
    const section = (page.sections ?? []).find((s: any) => s.type === exp.section_type);
    if (!section) throw new Error(`Live page has no '${exp.section_type}' section to update`);
    section.data = { ...section.data, ...winning.payload };
    const newId = await createPageVersion(slug, page.surface ?? "marketing", page, `Promoted experiment "${exp.key}" → variant ${winning.variant_key}`);
    await setLivePage(newId);
    const db = getClient();
    const { error } = await db.from("experiments").update({ status: "promoted", winning_variant_key: winning.variant_key, stopped_at: new Date().toISOString() }).eq("id", exp.id);
    if (error) throw new Error(error.message);
  },
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

export type ContentStatus = "idea" | "drafting" | "review" | "published" | "dismissed";

/** One row in the content-pipeline board list (lightweight; full row via getContentPipelineItem). */
export interface ContentPipelineRow {
  id: string;
  source: "insight" | "manual" | "signal";
  topic: string;
  angle: string | null;
  status: ContentStatus;
  has_audio: boolean;
  published_ref: string | null;
  created_at: string;
  updated_at: string;
}

/** Full content_pipeline row (the review screen). Mirrors the table; JSON columns stay loose. */
export interface ContentPipelineItem extends ContentPipelineRow {
  source_ref: string | null;
  grounding: unknown;
  draft_md: string | null;
  script: unknown;
  audio_url: string | null;
  audio_seconds: number | null;
  audio_bytes: number | null;
  seo: unknown;
  promo_schedule_id: string | null;
  created_by: string | null;
}

/** The single active brand-voice profile (drives the draft/audio steps). */
export interface VoiceProfile {
  id: string;
  name: string;
  reference_clip_url: string | null;
  provider_default: "chatterbox" | "elevenlabs";
  is_active: boolean;
  version: number;
  created_at: string;
  // Voice-studio (Kokoro) synthesis settings — Penny's spoken voice, admin-tunable.
  engine: "kokoro" | "chatterbox" | "elevenlabs";
  voice_a: string;
  voice_b: string | null;
  blend: number;   // weight of voice_a (0–1); voice_b = 1-blend
  speed: number;   // 0.5–2.0
  gap_ms: number;  // pause between sentences
  lang: "a" | "b"; // a=American, b=British
  bitrate: string;
  warmth: number;  // -6..6 dB low-shelf
}

/** The tunable spoken-voice settings an admin can change (all optional → partial update). */
export type VoiceSynthSettings = Partial<
  Pick<VoiceProfile, "engine" | "voice_a" | "voice_b" | "blend" | "speed" | "gap_ms" | "lang" | "bitrate" | "warmth">
>;

/** Update the active profile's spoken-voice settings. Renderer picks them up live. */
export async function setVoiceSynthSettings(s: VoiceSynthSettings): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("set_voice_synth_settings", {
    p_engine: s.engine ?? null,
    p_voice_a: s.voice_a ?? null,
    p_voice_b: s.voice_b ?? null,
    p_blend: s.blend ?? null,
    p_speed: s.speed ?? null,
    p_gap_ms: s.gap_ms ?? null,
    p_lang: s.lang ?? null,
    p_bitrate: s.bitrate ?? null,
    p_warmth: s.warmth ?? null,
  });
  if (error) throw new Error(`set_voice_synth_settings: ${error.message}`);
}

/** Render a short sample with the (possibly unsaved) settings → returns an audio URL. */
export async function previewVoice(s: VoiceSynthSettings): Promise<string> {
  const { data, error } = await getClient().functions.invoke("content-voice-preview", { body: s });
  if (error) throw new Error(`previewVoice: ${error.message}`);
  const url = (data as { audio_url?: string; error?: string } | null);
  if (!url?.audio_url) throw new Error(url?.error ?? "preview failed");
  return url.audio_url;
}

/** Kokoro American + British female voices offered in the studio. */
export const KOKORO_VOICES: { id: string; label: string }[] = [
  { id: "af_heart", label: "Heart — warm, balanced (American)" },
  { id: "af_nova", label: "Nova — friendly, rounded (American)" },
  { id: "af_aoede", label: "Aoede — warm, melodic (American)" },
  { id: "af_bella", label: "Bella — rich (American)" },
  { id: "af_kore", label: "Kore — clear, warm (American)" },
  { id: "af_sarah", label: "Sarah — standard warm (American)" },
  { id: "af_nicole", label: "Nicole — soft, intimate (American)" },
  { id: "af_river", label: "River — calm, soft (American)" },
  { id: "af_sky", label: "Sky — light, gentle (American)" },
  { id: "af_alloy", label: "Alloy — smooth, neutral (American)" },
  { id: "af_jessica", label: "Jessica — bright, youthful (American)" },
  { id: "bf_emma", label: "Emma — warm (British)" },
  { id: "bf_isabella", label: "Isabella — clear (British)" },
];

/** Board list, newest-updated first. Pass a status to filter to one stage. */
export async function listContentPipeline(status?: ContentStatus): Promise<ContentPipelineRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_content_pipeline", { p_status: status ?? null });
  if (error) throw new Error(`list_content_pipeline: ${error.message}`);
  return (data as ContentPipelineRow[]) ?? [];
}

/** Full row for the review screen, or null if not found. */
export async function getContentPipelineItem(id: string): Promise<ContentPipelineItem | null> {
  const db = getClient();
  const { data, error } = await db.rpc("get_content_pipeline_item", { p_id: id });
  if (error) throw new Error(`get_content_pipeline_item: ${error.message}`);
  return (data as ContentPipelineItem | null) ?? null;
}

/** Move an item between stages (the human-in-the-loop step), audited server-side. */
export async function setContentPipelineStatus(id: string, status: ContentStatus): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("set_content_pipeline_status", { p_id: id, p_status: status });
  if (error) throw new Error(`set_content_pipeline_status: ${error.message}`);
}

/** The active brand-voice profile, or null if none is active yet. */
export async function getActiveVoiceProfile(): Promise<VoiceProfile | null> {
  const db = getClient();
  const { data, error } = await db.rpc("get_active_voice_profile");
  if (error) throw new Error(`get_active_voice_profile: ${error.message}`);
  return (data as VoiceProfile | null) ?? null;
}

/** Surface the JSON error body from an edge-function invoke (they return {error}). */
async function fnError(error: unknown): Promise<string> {
  let detail = (error as Error).message;
  try {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string; detail?: string }> } }).context;
    if (ctx?.json) { const b = await ctx.json(); detail = b?.detail ?? b?.error ?? detail; }
  } catch { /* fall back to message */ }
  return detail;
}

/** Step 5 — auto-draft a pipeline item with Claude (brand-voice blog + audio script). */
export async function draftContentItem(itemId: string): Promise<{ model?: string }> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("content-draft", { body: { item_id: itemId } });
  if (error) throw new Error(await fnError(error));
  return (data as { model?: string }) ?? {};
}

/** Step 6 — render the item's audio. Kokoro renders async (returns status:"rendering"); audio_url lands when the Fly job finishes. */
export async function generateContentAudio(itemId: string): Promise<{ provider?: string; audio_url?: string; status?: string }> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("content-audio", { body: { item_id: itemId } });
  if (error) throw new Error(await fnError(error));
  return (data as { provider?: string; audio_url?: string; status?: string }) ?? {};
}

/** Step 8 — publish the item to the blog (+ best-effort promo) and mark it published. */
export async function publishContentItem(itemId: string): Promise<{ blog_path?: string }> {
  const db = getClient();
  const { data, error } = await db.functions.invoke("content-publish", { body: { item_id: itemId } });
  if (error) throw new Error(await fnError(error));
  return (data as { blog_path?: string }) ?? {};
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

// ── Outreach personas — the editable TASK NOTE each outreach surface layers on
// top of the single shared Voice guide. One surface-keyed store (signals,
// email); same versioned/live-toggle model as penny_voice / penny_discord_persona.
// Consumed live by the signals-worker (draft) and email-compose (compose).
export type OutreachSurface = "signals" | "email";

export interface OutreachPersonaRow {
  id: string;
  surface: OutreachSurface;
  version: number;
  body: string;
  notes: string | null;
  is_live: boolean;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
}

export async function listOutreachPersona(surface: OutreachSurface): Promise<OutreachPersonaRow[]> {
  const db = getClient();
  const { data, error } = await db.rpc("list_outreach_persona", { p_surface: surface });
  if (error) throw new Error(`list_outreach_persona: ${error.message}`);
  return ((data as OutreachPersonaRow[]) ?? []).map((r) => ({ ...r, version: Number(r.version) }));
}

export async function createOutreachPersonaVersion(
  surface: OutreachSurface,
  body: string,
  notes?: string,
): Promise<string> {
  const db = getClient();
  const { data, error } = await db.rpc("create_outreach_persona_version", {
    p_surface: surface,
    p_body: body,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(`create_outreach_persona_version: ${error.message}`);
  return data as string;
}

export async function setLiveOutreachPersona(id: string): Promise<void> {
  const db = getClient();
  const { error } = await db.rpc("set_live_outreach_persona", { p_id: id });
  if (error) throw new Error(`set_live_outreach_persona: ${error.message}`);
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
