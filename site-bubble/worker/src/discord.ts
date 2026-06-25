/**
 * Discord brain — same Penny voice, just on Discord.
 *
 * The Python bridge on Lightsail (now a thin relay, ~30 lines) forwards
 * every DM event it sees to POST /discord/dm here. This Worker:
 *   1. Checks the link table — is this Discord user confirmed?
 *   2. If yes: loads their context (email + recent tickets/messages),
 *      runs the same Claude call as the web widget, returns the reply.
 *   3. If no: mints a one-time link token and returns a reply that
 *      contains the magic URL. The bridge posts the URL back to the user.
 *
 * Cross-user leak guard: discord_user_id comes from the bridge, which got
 * it from Discord's gateway payload (cryptographically tied to the real
 * sender). We NEVER trust the message body for identity.
 *
 * Auth between bridge and Worker: shared secret in `DISCORD_BRIDGE_SECRET`,
 * sent as `Authorization: Bearer <secret>`. Bridge is the only legitimate
 * caller of these endpoints — without the secret, all 401.
 */

import type { Env } from "./worker-env";
import { Supabase } from "./supabase";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface DmBody {
  /** Discord user id from the gateway payload — trusted. */
  discord_user_id: string;
  /** Display name (handle#disc or new-style username). For logging only. */
  discord_username?: string;
  /** What the user said. */
  message: string;
  /** Discord channel/DM id the message arrived in — used for reply routing. */
  channel_id?: string;
}

interface ConfirmBody {
  token: string;
  email?: string;
  discord_user_id?: string;
  discord_username?: string;
}

interface RevokeBody {
  discord_user_id?: string;
  email?: string;
}

interface UserContext {
  linked: boolean;
  email: string;
  discord_channel_id: string | null;
  scopes: string[];
  tickets: Array<{
    id: string;
    subject: string;
    status: string;
    channel: string;
    first_message: string;
    created_at: string;
    messages: Array<{ author: string; body: string; at: string }>;
  }>;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authOk(req: Request, env: Env): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${env.DISCORD_BRIDGE_SECRET ?? ""}`;
  // Constant-time compare-ish; short strings, secret length is fixed.
  if (!env.DISCORD_BRIDGE_SECRET) return false;
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * The connect-link URL the user clicks to prove their email. Lands on
 * the admin app's confirm page, which calls /discord/confirm here.
 */
function connectLinkUrl(env: Env, token: string): string {
  // Worker serves the confirm page itself — no admin/marketing redeploy
  // required, and the page works even if the static sites are down.
  const base = (env.BUBBLE_PUBLIC_URL || "https://bubble.founderfirst.one").replace(/\/$/, "");
  return `${base}/connect-discord?token=${encodeURIComponent(token)}`;
}

/* ── /discord/dm ────────────────────────────────────────────────────────── */

export async function handleDiscordDm(
  req: Request,
  env: Env,
  callClaude: (system: string, messages: object[]) => Promise<string>,
  buildSystemPrompt: (supa: Supabase, contextBlock: string) => Promise<string>,
): Promise<Response> {
  if (!authOk(req, env)) return jsonResp({ error: "unauthorized" }, 401);

  let body: DmBody;
  try {
    body = (await req.json()) as DmBody;
  } catch {
    return jsonResp({ error: "invalid_json" }, 400);
  }
  if (!body.discord_user_id || typeof body.message !== "string" || body.message.length === 0) {
    return jsonResp({ error: "missing_fields" }, 400);
  }
  if (body.message.length > 2000) {
    return jsonResp({ error: "message_too_long" }, 400);
  }

  const supa = new Supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // Step 1 — do we know this Discord user?
  const ctx = await supa.rpc<UserContext | null>("get_user_context_for_discord", {
    p_discord_user_id: body.discord_user_id,
  });

  if (!ctx || !ctx.linked) {
    // Step 2a — not linked. Mint a token and return a connect message.
    const minted = await supa.rpc<Array<{ link_id: string; raw_token: string; expires_at: string }>>(
      "mint_discord_link_token",
      {
        p_email: null,
        p_discord_user_id: body.discord_user_id,
        p_discord_username: body.discord_username ?? null,
        p_initiated_from: "discord",
      },
    );
    const token = minted[0]?.raw_token;
    if (!token) return jsonResp({ error: "mint_failed" }, 500);
    const url = connectLinkUrl(env, token);
    return jsonResp({
      kind: "needs_link",
      reply:
        "Hi — happy to help. So I can pull up what you've already told Penny, click this link to confirm your email:\n" +
        url +
        "\n\nThe link works once and expires in 15 minutes.",
    });
  }

  // Step 2b — linked. Build a context block for the system prompt.
  const contextBlock = buildContextBlock(ctx);

  // Short-term memory: a rolling summary of older turns (folded into the
  // cached system prefix) plus the last few verbatim turns replayed as
  // messages. This gives Penny the whole conversation without resending it
  // all every turn — per-reply token cost stays flat as the chat grows.
  const mem = await supa
    .rpc<DmMemory>("discord_dm_load", { p_discord_user_id: body.discord_user_id, p_limit: KEEP_TURNS })
    .catch(() => ({ summary: "", turns: [] }) as DmMemory);

  const summaryBlock = mem.summary?.trim()
    ? `\n\n# Earlier in this conversation (summary)\n${mem.summary.trim()}`
    : "";
  const system = await buildSystemPrompt(supa, contextBlock + summaryBlock);

  const history = (mem.turns ?? []).map((t) => ({
    role: t.author === "user" ? "user" : "assistant",
    content: t.body,
  }));
  // The API requires the first message to be the user's — drop any leading
  // assistant turn left at the window boundary after a fold.
  while (history.length && history[0].role !== "user") history.shift();

  const raw = await callClaude(system, [...history, { role: "user", content: body.message }]);
  const reply = coerceToProse(raw);

  // Persist this exchange and fold older turns into the summary once the
  // verbatim window overflows. Best-effort: a memory hiccup must never break
  // the user-facing reply.
  try {
    const total = await supa.rpc<number>("discord_dm_append", {
      p_discord_user_id: body.discord_user_id,
      p_user_msg: body.message,
      p_bot_msg: reply,
    });
    if (total > FOLD_AT) {
      const all = await supa.rpc<DmMemory>("discord_dm_load", {
        p_discord_user_id: body.discord_user_id,
        p_limit: total,
      });
      const toFold = (all.turns ?? []).slice(0, Math.max(0, (all.turns?.length ?? 0) - KEEP_TURNS));
      if (toFold.length) {
        const newSummary = await summarizeConversation(callClaude, all.summary ?? "", toFold);
        await supa.rpc("discord_dm_set_summary", {
          p_discord_user_id: body.discord_user_id,
          p_summary: newSummary,
          p_keep: KEEP_TURNS,
        });
      }
    }
  } catch {
    // Swallow — memory persistence is non-critical to the reply.
  }

  return jsonResp({
    kind: "reply",
    reply,
    discord_channel_id: ctx.discord_channel_id,
    email: ctx.email,
  });
}

/* ── Conversation memory ────────────────────────────────────────────────── */

interface DmTurn { author: "user" | "bot"; body: string }
interface DmMemory { summary: string; turns: DmTurn[] }

/** Verbatim turns kept in the live window; older turns live in the summary. */
const KEEP_TURNS = 10;
/** Fold older turns into the rolling summary once the window exceeds this. */
const FOLD_AT = 24;

/**
 * Compress older turns into a durable summary, merged with the prior summary.
 * Reuses the same Claude call the reply path uses (Haiku) — runs only when the
 * window overflows (~once every several exchanges), so it's off the hot path.
 */
async function summarizeConversation(
  callClaude: (system: string, messages: object[]) => Promise<string>,
  prevSummary: string,
  turns: DmTurn[],
): Promise<string> {
  const transcript = turns
    .map((t) => `${t.author === "user" ? "User" : "Penny"}: ${t.body}`)
    .join("\n");
  const system =
    "You maintain durable memory of a support chat. Output 3–6 terse bullet points " +
    "capturing only what matters for future replies: the user's goal, account/order " +
    "details they shared, what was already tried, unresolved issues, and decisions made. " +
    "No preamble, no pleasantries. Merge the new messages into the existing summary and " +
    "drop nothing still relevant.";
  const user = `Existing summary:\n${prevSummary || "(none)"}\n\nNew messages to fold in:\n${transcript}`;
  const out = await callClaude(system, [{ role: "user", content: user }]);
  return out.trim().slice(0, 4000);
}

/**
 * Defensive: if the model returns the web-widget JSON contract anyway, pull
 * the prose out. Joins bubble headlines into a single paragraph and appends
 * the CTA label/url when present. Returns the input unchanged if it doesn't
 * look like our JSON shape.
 */
function coerceToProse(raw: string): string {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (!trimmed.startsWith("{")) return raw;
  try {
    const obj = JSON.parse(trimmed) as {
      bubbles?: Array<{ headline?: string }>;
      cta?: { label?: string; url?: string } | null;
    };
    const parts: string[] = [];
    for (const b of obj.bubbles ?? []) {
      if (typeof b?.headline === "string" && b.headline.trim()) parts.push(b.headline.trim());
    }
    if (obj.cta?.label && obj.cta?.url) parts.push(`${obj.cta.label}: ${obj.cta.url}`);
    return parts.length ? parts.join("\n\n") : raw;
  } catch {
    return raw;
  }
}

/* ── /discord/confirm ───────────────────────────────────────────────────── */

export async function handleDiscordConfirm(req: Request, env: Env): Promise<Response> {
  // Called from the admin app's connect page. Public (no bridge secret) —
  // safety here is the token itself: single-use, 15-min, sha-hashed.
  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return jsonResp({ error: "invalid_json" }, 400);
  }
  if (!body.token) return jsonResp({ error: "missing_token" }, 400);

  const supa = new Supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  try {
    const rows = await supa.rpc<Array<{ link_id: string; email_normalized: string; discord_user_id: string }>>(
      "confirm_discord_link",
      {
        p_raw_token: body.token,
        p_email: body.email ?? null,
        p_discord_user_id: body.discord_user_id ?? null,
        p_discord_username: body.discord_username ?? null,
      },
    );
    const row = rows[0];
    if (!row) return jsonResp({ error: "confirm_failed" }, 400);
    return jsonResp({
      ok: true,
      email: row.email_normalized,
      discord_user_id: row.discord_user_id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResp({ error: "confirm_failed", detail: msg.slice(0, 200) }, 400);
  }
}

/* ── /discord/disconnect ────────────────────────────────────────────────── */

export async function handleDiscordDisconnect(req: Request, env: Env): Promise<Response> {
  // Bridge-initiated revoke ("user said /disconnect"). Web-side revoke from
  // the admin app uses the same RPC via its own authenticated path.
  if (!authOk(req, env)) return jsonResp({ error: "unauthorized" }, 401);
  let body: RevokeBody;
  try {
    body = (await req.json()) as RevokeBody;
  } catch {
    return jsonResp({ error: "invalid_json" }, 400);
  }
  if (!body.discord_user_id && !body.email) {
    return jsonResp({ error: "missing_fields" }, 400);
  }

  const supa = new Supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const count = await supa.rpc<number>("revoke_discord_link", {
    p_discord_user_id: body.discord_user_id ?? null,
    p_email: body.email ?? null,
  });
  // Fresh start on disconnect: archive the user's turns (history is retained
  // as a backend record) and drop the live summary cache. True erasure is a
  // separate path (discord_dm_erase) for right-to-be-forgotten requests.
  if (body.discord_user_id) {
    await supa
      .rpc("discord_dm_disconnect", { p_discord_user_id: body.discord_user_id })
      .catch(() => {});
  }
  return jsonResp({ ok: true, revoked: count });
}

/* ── /discord/erase ─────────────────────────────────────────────────────── */

export async function handleDiscordErase(req: Request, env: Env): Promise<Response> {
  // Self-service right-to-erasure (the /forgetme command). Unlike /disconnect
  // (which soft-archives and retains history), this HARD-deletes the user's DM
  // transcript, conversation memory, and account-link row. Irreversible.
  if (!authOk(req, env)) return jsonResp({ error: "unauthorized" }, 401);
  let body: { discord_user_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonResp({ error: "invalid_json" }, 400);
  }
  if (!body.discord_user_id) return jsonResp({ error: "missing_fields" }, 400);

  const supa = new Supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const deleted = await supa.rpc("discord_dm_erase", {
    p_discord_user_id: body.discord_user_id,
  });
  return jsonResp({ ok: true, deleted });
}

/* ── /discord/attach-channel ────────────────────────────────────────────── */

export async function handleDiscordAttachChannel(req: Request, env: Env): Promise<Response> {
  if (!authOk(req, env)) return jsonResp({ error: "unauthorized" }, 401);
  let body: { discord_user_id: string; discord_channel_id: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonResp({ error: "invalid_json" }, 400);
  }
  if (!body.discord_user_id || !body.discord_channel_id) {
    return jsonResp({ error: "missing_fields" }, 400);
  }
  const supa = new Supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  await supa.rpc("attach_discord_channel", {
    p_discord_user_id: body.discord_user_id,
    p_discord_channel_id: body.discord_channel_id,
  });
  return jsonResp({ ok: true });
}

/* ── Context block ──────────────────────────────────────────────────────── */

/**
 * Render the user's context as a compact block to drop into the system
 * prompt. We keep it tight — the model doesn't need every message, just
 * enough to feel continuous.
 */
function buildContextBlock(ctx: UserContext): string {
  const lines: string[] = [];
  lines.push(`# Returning user`);
  lines.push(`Email on file: ${ctx.email}`);
  if (ctx.tickets.length === 0) {
    lines.push(`No prior tickets yet. This is a fresh conversation.`);
  } else {
    lines.push(`Recent conversations (newest first):`);
    for (const t of ctx.tickets) {
      lines.push(``);
      lines.push(`## ${t.subject}  —  status: ${t.status}  (${t.channel})`);
      lines.push(`First message: ${t.first_message}`);
      if (t.messages.length > 0) {
        lines.push(`Recent replies:`);
        // Messages came newest-first from the RPC; flip to chronological.
        const chrono = [...t.messages].reverse();
        for (const m of chrono) {
          const body = m.body.length > 240 ? m.body.slice(0, 240) + "…" : m.body;
          lines.push(`  - [${m.author}] ${body}`);
        }
      }
    }
  }
  lines.push(``);
  lines.push(`Use this context to answer without making the user repeat themselves. If you genuinely don't know something, ask once and move on. Never reveal another user's data.`);
  return lines.join("\n");
}
