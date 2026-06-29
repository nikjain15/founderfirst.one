/**
 * categorize — Penny's categorization loop (ARCHITECTURE.md §6, §11).
 *
 *   POST { op:"propose", org_id, entry_id }
 *     → { from_account_id, proposal: { account_id, code, name, type,
 *                                      confidence, rationale, source } | null }
 *   POST { op:"approve", org_id, entry_id, to_account_id, learn?, learn_value? }
 *     → { entry }   (the corrected, reposted journal entry)
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
  const entryId = String(body?.entry_id ?? "");
  if (!orgId || !entryId) return json({ error: "bad_request" }, 400);

  // Same gate as the Approve button: only a writer categorizes.
  const { data: canWrite } = await svc.rpc("can_write_org_as", { p_actor: user.id, target_org: orgId });
  if (!canWrite) return json({ error: "forbidden" }, 403);

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
  if (op !== "propose") return json({ error: "bad_op" }, 400);

  // Load the entry + its uncategorized line (description + direction).
  const { data: entry, error: eErr } = await svc.from("journal_entries")
    .select("id, memo, entry_date, org_id, status, lines:journal_lines(account_id, amount_minor, side)")
    .eq("id", entryId).eq("org_id", orgId).maybeSingle();
  if (eErr || !entry) return json({ error: "entry_not_found" }, 404);
  const uncatLine = (entry.lines as { account_id: string; side: string }[] | null)?.find((l) => l.account_id === fromAccountId);
  if (!uncatLine) return json({ error: "not_uncategorized", detail: "entry has no line on the holding account" }, 400);
  const description = (entry.memo ?? "").trim();
  // On the uncategorized line, a DEBIT means money left the bank (an expense);
  // a CREDIT means money came in (income). This steers the model's account pick.
  const direction = uncatLine.side === "D" ? "money out (likely an expense)" : "money in (likely income)";

  // 1) deterministic rule first — exact/contains, busiest wins (no model spend).
  const { data: ruleAccountId } = await svc.rpc("match_categorization_rule", { p_org: orgId, p_description: description });

  // load the org's own accounts (the grounding set; never the holding account).
  const { data: accountsRaw } = await svc.from("ledger_accounts")
    .select("id, code, name, type, is_archived").eq("org_id", orgId);
  const accounts = ((accountsRaw ?? []) as LedgerAccount[]).filter((a) => !a.is_archived && a.id !== fromAccountId);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const proposalFor = (accountId: string, source: "rule" | "penny", confidence: number, rationale: string) => {
    const a = byId.get(accountId);
    if (!a) return null;
    return { account_id: a.id, code: a.code, name: a.name, type: a.type, confidence, rationale, source };
  };

  if (ruleAccountId && byId.has(ruleAccountId as string)) {
    return json({ from_account_id: fromAccountId, proposal: proposalFor(ruleAccountId as string, "rule", 1, "Matched a learned rule for this description.") });
  }

  if (accounts.length === 0 || !description) {
    return json({ from_account_id: fromAccountId, proposal: null });
  }

  // 2) grounded inference — the model may ONLY choose from these account ids.
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ from_account_id: fromAccountId, proposal: null, note: "no_anthropic_key" });

  const roster = accounts.map((a) => `${a.id} | ${a.code ?? "—"} | ${a.name} | ${a.type}`).join("\n");
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["account_id", "confidence", "rationale"],
    properties: {
      account_id: { type: "string", enum: accounts.map((a) => a.id), description: "the chosen account's id — MUST be one of the listed ids" },
      confidence: { type: "number", description: "0 to 1 — how sure you are" },
      rationale: { type: "string", description: "one short sentence, plain language" },
    },
  } as const;
  const system = [
    "You are Penny, an autonomous bookkeeper. Categorize one bank transaction by",
    "choosing the single best ledger account from the chart of accounts provided.",
    "You MUST return an account_id that appears in the list — never invent one.",
    "Prefer income accounts for money in and expense accounts for money out.",
    "If nothing is a good fit, pick the closest and give it a low confidence.",
  ].join(" ");
  const userMsg = [
    `Transaction: "${description}" — ${direction}.`,
    "",
    "Chart of accounts (id | code | name | type):",
    roster,
  ].join("\n");

  try {
    const result = await resolveOnDeno(
      {
        useCase: USE_CASE_CATEGORIZE,
        tenantId: orgTenant(orgId),
        system,
        messages: [{ role: "user", content: userMsg }],
        maxTokens: 300,
        temperature: 0,
        jsonSchema: schema,
        timeoutMs: 30_000,
        anthropic: { maxRetries: 1 },
        pinModel: { provider: "anthropic", model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001" },
        record: { storeInput: true, ref: entryId },
      },
      { ANTHROPIC_API_KEY: apiKey, SUPABASE_URL, SUPABASE_SERVICE_KEY: SERVICE_ROLE_KEY },
    );
    const parsed = JSON.parse(result.text || "{}") as { account_id?: string; confidence?: number; rationale?: string };
    // server-authoritative grounding: reject anything not in the org's accounts.
    if (!parsed.account_id || !byId.has(parsed.account_id)) {
      return json({ from_account_id: fromAccountId, proposal: null, note: "ungrounded_or_empty" });
    }
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));
    const rationale = (parsed.rationale ?? "").toString().slice(0, 280) || "Penny's best match for this transaction.";
    return json({ from_account_id: fromAccountId, proposal: proposalFor(parsed.account_id, "penny", confidence, rationale) });
  } catch (e) {
    return json({ from_account_id: fromAccountId, proposal: null, note: "inference_failed", detail: (e as Error).message }, 200);
  }
});
