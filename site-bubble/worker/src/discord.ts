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
  const system = await buildSystemPrompt(supa, contextBlock);

  const reply = await callClaude(system, [
    { role: "user", content: body.message },
  ]);

  return jsonResp({
    kind: "reply",
    reply,
    discord_channel_id: ctx.discord_channel_id,
    email: ctx.email,
  });
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
  return jsonResp({ ok: true, revoked: count });
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
