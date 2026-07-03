/**
 * penny-thread — the grounded Q&A brain for the in-app Penny thread (card W3.1).
 *
 *   POST { op:"answer", org_id, question }
 *     → { text, fact_stated }   a plain-language answer PHRASING the SERVER fact
 *   POST { op:"answer", org_id, question }  (out of scope, or no books yet)
 *     → { text, declined:true } an out-of-scope refusal / connect-books defer
 *
 * Grounding discipline — the server is AUTHORITATIVE (P2-1). The client also routes
 * + computes for a snappy optimistic UI, and MAY send its own `fact`, but this fn
 * NEVER trusts it. On every request the fn:
 *   1. RE-ROUTES the message with the shared routing logic (_shared/thread/route.ts,
 *      a port of apps/app ledger/thread.ts) — if the server deems it out of scope it
 *      declines, regardless of what the client sent.
 *   2. RE-COMPUTES the fact from the org's OWN ledger via a service-role SELECT
 *      (paginated, the exact report math). The server figure wins over any client
 *      figure; a forged client amount is discarded.
 *   3. Keeps the post-check: if the model emits any figure other than the server
 *      fact, its output is discarded for the deterministic phrasing.
 * So a hallucinated OR client-forged number is structurally impossible.
 *
 * Empty books (no entries): a books question defers to "connect your books first"
 * (P3) rather than reporting a hollow $0.00 as if it were real.
 *
 * Penny's language is the live 'app' persona (CENTRAL-1, ~60s cache + baked
 * fallback) — editing it changes the thread with no redeploy, on the model path AND
 * the deterministic path (P2-2). Every model call is recorded via the inference layer.
 *
 * RLS-scoped: the caller must be able to READ the org (can_access_org_as).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveOnDeno } from "../_shared/inference/deno.ts";
import { orgTenant } from "../_shared/inference/core.ts";
import { getAppPersona, APP_THREAD_PERSONA_BASE } from "../_shared/appPersona.ts";
import {
  routeMessage, computeMetric, money, metricPhrase, personaOverride,
  DECLINE_DEFAULT, CONNECT_BOOKS_DEFAULT,
  type GroundedFact, type JournalEntry,
} from "../_shared/thread/route.ts";

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

// ── server-side ledger read (authoritative fact) ──────────────────────────────
const ENTRY_SELECT =
  "entry_date,status," +
  "lines:journal_lines(account_id,amount_minor,side," +
  "account:ledger_accounts(code,name,type))";
const ENTRY_PAGE = 1000;
const MAX_ENTRY_PAGES = 1000;

/** Every posted/reversed entry for the org (all pages), service-role, org-scoped. */
// deno-lint-ignore no-explicit-any
async function fetchEntries(svc: any, orgId: string): Promise<JournalEntry[]> {
  const all: JournalEntry[] = [];
  for (let page = 0; page < MAX_ENTRY_PAGES; page++) {
    const from = page * ENTRY_PAGE;
    const { data, error } = await svc
      .from("journal_entries")
      .select(ENTRY_SELECT)
      .eq("org_id", orgId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + ENTRY_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as JournalEntry[];
    all.push(...rows);
    if (rows.length < ENTRY_PAGE) return all;
  }
  throw new Error("penny-thread: exceeded the maximum page count");
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

  // A thread question is a READ — a read-only CPA may ask too. Actor-based read
  // check (service-role path; auth.uid() is null here). Granted to service_role only.
  const { data: canAccess } = await svc.rpc("can_access_org_as", { p_actor: user.id, target_org: orgId });
  if (!canAccess) return json({ error: "forbidden" }, 403);

  const question = String(body?.question ?? "").slice(0, 500);

  // Persona is loaded once; used for the model system prompt AND the deterministic
  // decline / connect-books copy (P2-2). Q&A-appropriate baked fallback (not the
  // categorize prompt).
  const persona = await getAppPersona(
    { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY }, "app", APP_THREAD_PERSONA_BASE,
  );
  const declineCopy = personaOverride(persona, "decline") ?? DECLINE_DEFAULT;
  const connectCopy = personaOverride(persona, "empty") ?? CONNECT_BOOKS_DEFAULT;

  // 1. RE-ROUTE server-side. The client's classification is not trusted — if the
  //    server deems the turn out of scope, decline regardless of any client fact.
  const route = routeMessage(question, new Date());
  if (route.intent !== "question" || !route.query) {
    const text = await phrase(orgId, question, persona, null, declineCopy);
    return json({ text, declined: true });
  }

  // 2. RE-COMPUTE the fact from the org's OWN ledger (service-role). The server
  //    figure is authoritative; any client-sent amount is ignored.
  let entries: JournalEntry[];
  try {
    entries = await fetchEntries(svc, orgId);
  } catch {
    return json({ error: "ledger_read_failed" }, 502);
  }

  // P3: no books yet → defer to "connect your books first", not a hollow $0.00.
  if (entries.length === 0) {
    const text = await phrase(orgId, question, persona, null, connectCopy);
    return json({ text, declined: true, reason: "no_books" });
  }

  const computed = computeMetric(entries, route.query);
  // A named category that matched no account → decline (don't report 0 as real).
  if (computed.categoryUnmatched) {
    const text = await phrase(orgId, question, persona, null, declineCopy);
    return json({ text, declined: true, reason: "category_unmatched" });
  }

  const text = await phrase(orgId, question, persona, computed, declineCopy);
  return json({ text, fact_stated: money(computed.amountMinor) });
});

/**
 * Phrase the answer (or the refusal/defer) in Penny's live voice. The fact's money
 * string is pre-rendered and the model is told to state it verbatim — it may not
 * emit any other number. Falls back to the deterministic phrasing (also persona-
 * driven for the decline/defer copy) if the model call fails or the key is unset,
 * so the owner always gets the correct figure with no key / an outage.
 *
 * `declineCopy` is the persona-driven decline/defer sentence used when there is no
 * fact (so editing the 'app' persona changes even the deterministic output — P2-2).
 */
async function phrase(
  orgId: string, question: string, persona: string,
  fact: GroundedFact | null, declineCopy: string,
): Promise<string> {
  const deterministic = fact ? metricPhrase(fact) : declineCopy;

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return deterministic;

  const instruction = fact
    ? [
        `The owner asked: "${question}".`,
        `The answer, computed exactly from their ledger, is: ${metricPhrase(fact)}`,
        `Restate that in one or two warm, plain sentences a business owner would understand.`,
        `You MUST use this exact money figure and no other number: ${money(fact.amountMinor)}.`,
        `Do not add figures, estimates, percentages, or advice. If a category was named and it's not in the figure, don't invent one.`,
      ].join("\n")
    : [
        `The owner asked: "${question}".`,
        `This can't be answered from their ledger right now. Reply with this message, in your own warm voice, in one short sentence: "${declineCopy}"`,
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
    // Grounding guard: if the model emitted a money figure that isn't the computed
    // one, distrust it and return the deterministic (correct) phrasing.
    if (fact && !text.includes(money(fact.amountMinor))) return deterministic;
    return text;
  } catch {
    return deterministic;
  }
}
