/**
 * penny-thread — the grounded Q&A brain for the in-app Penny thread (card W3.1).
 *
 *   POST { op:"answer", org_id, question, fact }
 *     → { text }              a plain-language answer PHRASING the given fact
 *   POST { op:"answer", org_id, question, fact:null }
 *     → { text, declined:true }   an out-of-scope refusal (no number invented)
 *
 * Grounding discipline (same as categorize): the NUMBER is never generated. The
 * client computes the fact deterministically from the org's own paginated ledger
 * (apps/app ledger/thread.ts computeMetric — the exact report math, tie-to-cent)
 * and sends it here; this fn only wraps it in Penny's live 'app' voice. When there
 * is no fact (an unsupported question, or a category that matched no account) the
 * fn DECLINES — it does not answer with a figure. So a hallucinated number is
 * structurally impossible: the model is given the answer's value and told to state
 * it verbatim, never to compute or estimate.
 *
 * Penny's language is the live 'app' persona (CENTRAL-1, ~60s cache + baked
 * fallback) — editing it changes the thread with no redeploy. Every model call is
 * recorded to ai_decisions via the shared inference layer.
 *
 * RLS-scoped: the caller must be able to READ the org (can_access_org) — a thread
 * question is a read, so a read-only CPA may ask too.
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
const USE_CASE_THREAD = "penny_thread";

// The client-computed fact the answer must phrase. amount_minor is authoritative;
// the model states it, never recomputes it.
interface GroundedFact {
  metric: "spend" | "income" | "net" | "cash";
  amount_minor: number;
  category_label: string | null;
  period_label: string;
}

// Format minor units as a plain money string server-side, so the exact figure the
// model must state is pre-rendered (it can't reformat it into a different number).
function money(minor: number): string {
  const neg = minor < 0;
  const v = Math.abs(minor) / 100;
  const s = v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return neg ? `(${s})` : s;
}

function metricPhrase(f: GroundedFact): string {
  const amt = money(f.amount_minor);
  const where = f.category_label ? ` on ${f.category_label}` : "";
  const when = f.period_label && f.period_label !== "all time" ? ` in ${f.period_label}` : " (all time)";
  switch (f.metric) {
    case "spend": return `The business spent ${amt}${where}${when}.`;
    case "income": return `The business brought in ${amt}${where}${when}.`;
    case "net": return `Net income was ${amt}${when}.`;
    case "cash": return `Cash and assets stand at ${amt}${f.period_label && f.period_label !== "all time" ? ` as of ${f.period_label}` : ""}.`;
  }
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
  const op = String(body?.op ?? "answer");
  const orgId = String(body?.org_id ?? "");
  if (!orgId) return json({ error: "bad_request" }, 400);
  if (op !== "answer") return json({ error: "bad_op" }, 400);

  // A thread question is a READ — a read-only CPA may ask too. Gate on the actor-
  // based read check (service-role path; auth.uid() is null here, so we can't use
  // the RLS can_access_org(target_org)). Granted to service_role only.
  const { data: canAccess } = await svc.rpc("can_access_org_as", { p_actor: user.id, target_org: orgId });
  if (!canAccess) return json({ error: "forbidden" }, 403);

  const question = String(body?.question ?? "").slice(0, 500);
  const rawFact = body?.fact as Record<string, unknown> | null | undefined;

  // No fact → the question was out of scope (or a category matched nothing). Decline
  // in Penny's voice — NEVER answer with an invented figure (grounding-scope gate).
  if (!rawFact || typeof rawFact.amount_minor !== "number") {
    const persona = await getAppPersona({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY });
    const text = await phrase(orgId, question, persona, null);
    return json({ text, declined: true });
  }

  const fact: GroundedFact = {
    metric: rawFact.metric as GroundedFact["metric"],
    amount_minor: Math.round(Number(rawFact.amount_minor)),
    category_label: rawFact.category_label != null ? String(rawFact.category_label) : null,
    period_label: String(rawFact.period_label ?? "all time"),
  };
  const persona = await getAppPersona({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY });
  const text = await phrase(orgId, question, persona, fact);
  return json({ text, fact_stated: money(fact.amount_minor) });
});

/**
 * Phrase the answer (or the refusal) in Penny's live voice. The fact's money string
 * is pre-rendered and the model is instructed to state it verbatim — it may not
 * emit any other number. Falls back to the deterministic phrasing if the model call
 * fails, so the owner always gets the correct figure even with no key / an outage.
 */
async function phrase(
  orgId: string, question: string, persona: string, fact: GroundedFact | null,
): Promise<string> {
  const deterministic = fact
    ? metricPhrase(fact)
    : "That's not something I can pull from your books — I can answer questions about your income, spending, profit, and cash. Ask me one of those and I'll get you the exact figure.";

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return deterministic;

  const instruction = fact
    ? [
        `The owner asked: "${question}".`,
        `The answer, computed exactly from their ledger, is: ${metricPhrase(fact)}`,
        `Restate that in one or two warm, plain sentences a business owner would understand.`,
        `You MUST use this exact money figure and no other number: ${money(fact.amount_minor)}.`,
        `Do not add figures, estimates, percentages, or advice. If a category was named and it's not in the figure, don't invent one.`,
      ].join("\n")
    : [
        `The owner asked: "${question}".`,
        `This can't be answered from their ledger (it's not a question about their income, spending, profit, or cash — or it's advice/prediction).`,
        `Reply in one short, warm sentence that you can't pull that from their books, and remind them what you CAN answer (income, spending, profit, cash).`,
        `Do NOT state any dollar figure or make up a number.`,
      ].join("\n");

  try {
    const result = await resolveOnDeno(
      {
        useCase: USE_CASE_THREAD, tenantId: orgTenant(orgId), system: persona,
        messages: [{ role: "user", content: instruction }],
        maxTokens: 200, temperature: 0.3, timeoutMs: 30_000,
        anthropic: { maxRetries: 1 },
        pinModel: { provider: "anthropic", model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001" },
        record: { storeInput: true, ref: `thread:${orgId}` },
      },
      { ANTHROPIC_API_KEY: apiKey, SUPABASE_URL, SUPABASE_SERVICE_KEY: SERVICE_ROLE_KEY },
    );
    const text = (result.text ?? "").trim();
    if (!text) return deterministic;
    // Grounding guard: if the model somehow emitted a money figure that isn't the
    // computed one, distrust it and return the deterministic (correct) phrasing.
    if (fact && !text.includes(money(fact.amount_minor))) return deterministic;
    return text;
  } catch {
    return deterministic;
  }
}
