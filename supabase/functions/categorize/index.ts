/**
 * categorize — Penny's categorization loop (ARCHITECTURE.md §6, §11).
 *
 *   POST { op:"propose", org_id, entry_id }
 *     → { from_account_id, proposal: { account_id, code, name, type,
 *                                      confidence, rationale, source } | null }
 *   POST { op:"approve", org_id, entry_id, to_account_id, learn?, learn_value? }
 *     → { entry }   (the corrected, reposted journal entry)
 *   POST { op:"delete_rule", org_id, rule_id }
 *     → { rule }    (the deactivated learned rule; W1.6 — Penny stops applying it)
 *
 * Propose is server-authoritative and GROUNDED: it tries the deterministic rule
 * matcher first, then falls back to the inference layer constrained to the org's
 * OWN ledger accounts (the suggested account_id must be one we sent — a model
 * can't invent an account). Approve runs recategorize_entry (reverse + repost +
 * learn), so the books stay append-only and the fix is learned for next time.
 *
 * Every path is RLS-scoped: the caller must be able to WRITE the org
 * (can_write_org_as) — the same gate the Approve button checks in the UI.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveOnDeno } from "../_shared/inference/deno.ts";
import { orgTenant } from "../_shared/inference/core.ts";
import { getAppPersona } from "../_shared/appPersona.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Free-form label for the ai_decisions record; pinModel (below) decides the model
// so this need not exist in the routing table (core.ts resolve: pinModel wins).
const USE_CASE_CATEGORIZE = "penny_categorize";

interface LedgerAccount { id: string; code: string | null; name: string; type: string; is_archived: boolean; }

// The trust-tier knobs are DATA (platform_config, CENTRAL-1) — read via the one
// reader RPC, org override folded over the platform default. The baked fallback
// mirrors apps/app/src/copy/config.ts CONFIG_DEFAULTS + the migration seed, so
// behavior is identical whether or not the read lands. NO magic numbers below.
interface BehaviorConfig {
  confidence_high: number; confidence_medium: number;
  auto_propose_limit: number; asks_per_week: number; digest_cadence_days: number;
}
const CONFIG_DEFAULTS: BehaviorConfig = {
  confidence_high: 0.75, confidence_medium: 0.45,
  auto_propose_limit: 8, asks_per_week: 5, digest_cadence_days: 7,
};
// deno-lint-ignore no-explicit-any
async function effectiveConfig(svc: any, orgId: string): Promise<BehaviorConfig> {
  const { data } = await svc.rpc("get_effective_behavior_config", { p_org: orgId });
  const raw = (data ?? {}) as Record<string, unknown>;
  const out = { ...CONFIG_DEFAULTS };
  for (const k of Object.keys(out) as (keyof BehaviorConfig)[]) {
    const v = Number(raw[k]);
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}
type Tier = "high" | "medium" | "low";
function tierFor(confidence: number, source: string, cfg: BehaviorConfig): Tier {
  // A learned rule / repeat-vendor / kernel vendor-prior is HIGH by provenance —
  // Penny has seen this exact call before. Otherwise band by the config cutoffs.
  if (source === "rule" || source === "vendor_prior") return "high";
  if (confidence >= cfg.confidence_high) return "high";
  if (confidence >= cfg.confidence_medium) return "medium";
  return "low";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await svc.auth.getUser(jwt);
  const user = u?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const op = String(body?.op ?? "");
  const orgId = String(body?.org_id ?? "");
  if (!orgId) return json({ error: "bad_request" }, 400);

  // Same gate as the Approve button: only a writer categorizes (or deletes a
  // learned rule — read-only CPA fails here AND in the RPC).
  const { data: canWrite } = await svc.rpc("can_write_org_as", { p_actor: user.id, target_org: orgId });
  if (!canWrite) return json({ error: "forbidden" }, 403);

  // ── W3.2 trust-tiered autonomy ops ───────────────────────────────────────────
  // The tier cutoffs + the ≤5-asks/week budget are DATA (platform_config via
  // get_effective_behavior_config, CENTRAL-1) — never a magic number in this fn.

  // budget → { spent, budget, remaining } for THIS org, THIS week.
  if (op === "budget") {
    const cfg = await effectiveConfig(svc, orgId);
    const { data: spent } = await svc.rpc("owner_asks_this_week", { p_org: orgId });
    const used = Number(spent ?? 0);
    return json({ spent: used, budget: cfg.asks_per_week, remaining: Math.max(0, cfg.asks_per_week - used) });
  }

  // activity → the "Penny did this" feed (RLS-scoped read via the RPC).
  if (op === "activity") {
    const { data, error } = await svc.rpc("list_penny_activity", { p_org: orgId, p_limit: 50 });
    if (error) return json({ error: error.message }, 400);
    return json({ activity: data ?? [] });
  }

  // undo → 1-tap undo of one auto-post (reversal path; ledger stays balanced).
  if (op === "undo") {
    const activityId = String(body?.activity_id ?? "");
    if (!activityId) return json({ error: "bad_request: activity_id required" }, 400);
    const { data, error } = await svc.rpc("undo_penny_activity", {
      p_actor: user.id, p_org: orgId, p_activity_id: activityId,
    });
    if (error) return json({ error: error.message }, /forbidden/.test(error.message) ? 403 : 400);
    return json({ activity: data });
  }

  // record_ask → tag one owner interruption in ai_decisions (budget accounting).
  if (op === "record_ask") {
    const askEntryId = String(body?.entry_id ?? "");
    if (!askEntryId) return json({ error: "bad_request: entry_id required" }, 400);
    const { error } = await svc.rpc("record_owner_ask", { p_org: orgId, p_entry_id: askEntryId, p_actor: user.id });
    if (error) return json({ error: error.message }, 400);
    const { data: spent } = await svc.rpc("owner_asks_this_week", { p_org: orgId });
    return json({ spent: Number(spent ?? 0) });
  }

  // ── delete_rule (W1.6) ───────────────────────────────────────────────────────
  // Soft-delete a learned categorization rule by id. Deactivating flips is_active
  // off; the matcher filters is_active, so Penny stops proposing from it on the
  // next categorize. Audit-logged (rule.delete) in the SECDEF RPC. This op keys on
  // the rule id only — it never evaluates match_value as a LIKE pattern, so the
  // CAT-F4 ESCAPE hardening in match_categorization_rule is untouched.
  if (op === "delete_rule") {
    const ruleId = String(body?.rule_id ?? "");
    if (!ruleId) return json({ error: "bad_request: rule_id required" }, 400);
    const { data: rule, error } = await svc.rpc("deactivate_categorization_rule", {
      p_actor: user.id, p_org: orgId, p_rule_id: ruleId,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ rule });
  }

  const entryId = String(body?.entry_id ?? "");
  if (!entryId) return json({ error: "bad_request" }, 400);

  // The holding account every uncategorized line sits on (the "from" side).
  const { data: fromAccountId, error: uErr } = await svc.rpc("resolve_uncategorized_account", { p_actor: user.id, p_org: orgId });
  if (uErr || !fromAccountId) return json({ error: "no_uncategorized_account", detail: uErr?.message }, 500);

  // ── approve ────────────────────────────────────────────────────────────────
  if (op === "approve") {
    const toAccountId = String(body?.to_account_id ?? "");
    if (!toAccountId) return json({ error: "bad_request: to_account_id required" }, 400);
    const learn = body?.learn === undefined ? true : Boolean(body.learn);
    const learnValue = body?.learn_value != null ? String(body.learn_value) : null;
    const idem = `categorize:${entryId}:${toAccountId}`;
    const { data: entry, error } = await svc.rpc("recategorize_entry", {
      p_actor: user.id, p_org: orgId, p_entry_id: entryId,
      p_from_account_id: fromAccountId, p_to_account_id: toAccountId,
      p_idempotency_key: idem, p_learn: learn, p_learn_value: learnValue,
      p_learn_type: "description_contains",
    });
    if (error) return json({ error: error.message }, 400);
    return json({ entry });
  }

  // ── propose ─────────────────────────────────────────────────────────────────
  if (op === "propose") {
    const r = await computeProposal(svc, orgId, entryId, fromAccountId as string);
    if (r.error) return json({ error: r.error }, r.status ?? 400);
    return json({ from_account_id: fromAccountId, proposal: r.proposal, note: r.note });
  }

  // ── triage (W3.2) — server-authoritative tier decision + HIGH auto-post ──────
  // The ONE call the app makes per uncategorized entry. The server proposes
  // (grounded, same path as propose), bands the result by the config cutoffs, and:
  //   • HIGH → auto-posts (Penny did this) + records a feed row; no card.
  //   • MEDIUM → returns the proposal for the batch-approve queue.
  //   • LOW/unknown → returns a card, UNLESS it's income (goes to the digest, not a
  //     card) or the week's ≤5-ask budget is spent (defers to the digest).
  if (op === "triage") {
    const cfg = await effectiveConfig(svc, orgId);
    const r = await computeProposal(svc, orgId, entryId, fromAccountId as string);
    if (r.error) return json({ error: r.error }, r.status ?? 400);
    const p = r.proposal;

    if (!p) {
      // No grounded pick → a low-confidence unknown; subject to the same budget.
      return await lowTierResponse(svc, orgId, entryId, null, cfg);
    }
    const tier = tierFor(p.confidence, p.source, cfg);
    if (tier === "high") {
      const idem = `autopost:${entryId}:${p.account_id}`;
      const summary = pennyDidSummary(p);
      const { data: activity, error } = await svc.rpc("autopost_categorization", {
        p_actor: user.id, p_org: orgId, p_entry_id: entryId,
        p_from_account_id: fromAccountId, p_to_account_id: p.account_id,
        p_idempotency_key: idem, p_source: p.source === "rule" ? "rule" : (p.source === "vendor_prior" ? "vendor_prior" : "penny"),
        p_confidence: p.confidence, p_summary: summary, p_learn_value: null,
      });
      // If the period is locked (or another guard trips), don't lose the item —
      // fall back to a review card so the owner can still act.
      if (error) return await lowTierResponse(svc, orgId, entryId, p, cfg, error.message);
      return json({ tier: "high", proposal: p, activity });
    }
    if (tier === "medium") {
      return json({ tier: "medium", proposal: p });
    }
    return await lowTierResponse(svc, orgId, entryId, p, cfg);
  }

  return json({ error: "bad_op" }, 400);
});

// ── shared proposal computation (used by propose + triage) ───────────────────
type Proposal = {
  account_id: string; code: string | null; name: string; type: string;
  confidence: number; rationale: string; source: "rule" | "vendor_prior" | "penny";
};
type ProposalResult = { proposal: Proposal | null; note?: string; error?: string; status?: number };

// deno-lint-ignore no-explicit-any
async function computeProposal(svc: any, orgId: string, entryId: string, fromAccountId: string): Promise<ProposalResult> {
  const { data: entry, error: eErr } = await svc.from("journal_entries")
    .select("id, memo, entry_date, org_id, status, lines:journal_lines(account_id, amount_minor, side)")
    .eq("id", entryId).eq("org_id", orgId).maybeSingle();
  if (eErr || !entry) return { proposal: null, error: "entry_not_found", status: 404 };
  const uncatLine = (entry.lines as { account_id: string; side: string }[] | null)?.find((l) => l.account_id === fromAccountId);
  if (!uncatLine) return { proposal: null, error: "not_uncategorized", status: 400 };
  const description = (entry.memo ?? "").trim();
  const direction = uncatLine.side === "D" ? "money out (likely an expense)" : "money in (likely income)";

  // 1) repeat-vendor / kernel vendor-prior — a confident, learned account for this
  //    vendor (CENTRAL-2). Server-authoritative, no model spend; HIGH by provenance.
  const vendor = await matchVendorPrior(svc, orgId, description);

  // 2) deterministic learned rule.
  const { data: ruleAccountId } = await svc.rpc("match_categorization_rule", { p_org: orgId, p_description: description });

  const { data: accountsRaw } = await svc.from("ledger_accounts")
    .select("id, code, name, type, is_archived").eq("org_id", orgId);
  const accounts = ((accountsRaw ?? []) as LedgerAccount[]).filter((a) => !a.is_archived && a.id !== fromAccountId);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const proposalFor = (accountId: string, source: Proposal["source"], confidence: number, rationale: string): Proposal | null => {
    const a = byId.get(accountId);
    if (!a) return null;
    return { account_id: a.id, code: a.code, name: a.name, type: a.type, confidence, rationale, source };
  };

  if (vendor && byId.has(vendor.account_id)) {
    return { proposal: proposalFor(vendor.account_id, "vendor_prior", 1, "You've filed this vendor here before.") };
  }
  if (ruleAccountId && byId.has(ruleAccountId as string)) {
    return { proposal: proposalFor(ruleAccountId as string, "rule", 1, "Matched a learned rule for this description.") };
  }
  if (accounts.length === 0 || !description) {
    return { proposal: null };
  }

  // 3) grounded inference — the model may ONLY choose from these account ids.
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { proposal: null, note: "no_anthropic_key" };

  const roster = accounts.map((a) => `${a.id} | ${a.code ?? "—"} | ${a.name} | ${a.type}`).join("\n");
  const schema = {
    type: "object", additionalProperties: false,
    required: ["account_id", "confidence", "rationale"],
    properties: {
      account_id: { type: "string", enum: accounts.map((a) => a.id), description: "the chosen account's id — MUST be one of the listed ids" },
      confidence: { type: "number", description: "0 to 1 — how sure you are" },
      rationale: { type: "string", description: "one short sentence, plain language" },
    },
  } as const;
  const system = await getAppPersona({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY });
  const userMsg = [`Transaction: "${description}" — ${direction}.`, "", "Chart of accounts (id | code | name | type):", roster].join("\n");

  try {
    const result = await resolveOnDeno(
      {
        useCase: USE_CASE_CATEGORIZE, tenantId: orgTenant(orgId), system,
        messages: [{ role: "user", content: userMsg }],
        maxTokens: 300, temperature: 0, jsonSchema: schema, timeoutMs: 30_000,
        anthropic: { maxRetries: 1 },
        pinModel: { provider: "anthropic", model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001" },
        record: { storeInput: true, ref: entryId },
      },
      { ANTHROPIC_API_KEY: apiKey, SUPABASE_URL, SUPABASE_SERVICE_KEY: SERVICE_ROLE_KEY },
    );
    const parsed = JSON.parse(result.text || "{}") as { account_id?: string; confidence?: number; rationale?: string };
    if (!parsed.account_id || !byId.has(parsed.account_id)) {
      return { proposal: null, note: "ungrounded_or_empty" };
    }
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));
    const rationale = (parsed.rationale ?? "").toString().slice(0, 280) || "Penny's best match for this transaction.";
    return { proposal: proposalFor(parsed.account_id, "penny", confidence, rationale) };
  } catch (e) {
    return { proposal: null, note: "inference_failed: " + (e as Error).message };
  }
}

// Repeat-vendor / kernel vendor-prior (CENTRAL-2). A learned rule IS the vendor
// prior once approved, so we key off the busiest learned rule whose match_value is
// contained in this description with a high hit count — a vendor we've filed the
// same way repeatedly. Best-effort: any error/absence just yields null (the rule
// + inference paths still run).
// deno-lint-ignore no-explicit-any
async function matchVendorPrior(svc: any, orgId: string, description: string): Promise<{ account_id: string } | null> {
  if (!description) return null;
  try {
    const { data } = await svc
      .from("categorization_rules")
      .select("account_id, match_value, times_applied, is_active, match_type")
      .eq("org_id", orgId).eq("is_active", true).gte("times_applied", 2)
      .order("times_applied", { ascending: false }).limit(25);
    const desc = description.toLowerCase();
    for (const r of (data ?? []) as { account_id: string; match_value: string; match_type: string }[]) {
      const mv = (r.match_value ?? "").toLowerCase().trim();
      if (!mv) continue;
      const hit = r.match_type === "description_exact" ? desc === mv : desc.includes(mv);
      if (hit) return { account_id: r.account_id };
    }
  } catch { /* best-effort */ }
  return null;
}

// LOW-tier disposition: income → digest (never a card); budget spent → digest;
// otherwise an approval card, and we record the interruption against the budget.
// deno-lint-ignore no-explicit-any
async function lowTierResponse(svc: any, orgId: string, entryId: string, proposal: Proposal | null, cfg: BehaviorConfig, autopostError?: string) {
  // Income celebration lives in the digest, NOT a card (acceptance: no income card).
  if (proposal && proposal.type === "income") {
    return json({ tier: "digest", reason: "income", proposal });
  }
  const { data: spent } = await svc.rpc("owner_asks_this_week", { p_org: orgId });
  const used = Number(spent ?? 0);
  if (used >= cfg.asks_per_week) {
    // Budget spent → defer to the digest rather than interrupt (deferral rule).
    return json({ tier: "digest", reason: "budget_spent", spent: used, budget: cfg.asks_per_week, proposal });
  }
  // A real interruption — count it, then return the card.
  await svc.rpc("record_owner_ask", { p_org: orgId, p_entry_id: entryId });
  return json({
    tier: "low", variant: "low_confidence", proposal,
    spent: used + 1, budget: cfg.asks_per_week,
    note: autopostError ? "autopost_fell_back: " + autopostError : undefined,
  });
}

// The owner-facing "Penny did this" line for the feed. Kept short + plain; the
// account name carries the specifics. (Penny's deeper voice is the live persona;
// this is a structural label, not tunable prose.)
function pennyDidSummary(p: Proposal): string {
  const acct = p.code ? `${p.code} · ${p.name}` : p.name;
  return `Filed under ${acct}`;
}
