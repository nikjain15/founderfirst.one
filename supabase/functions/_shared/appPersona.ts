/**
 * Live in-app Penny persona loader — card CENTRAL-1.
 *
 * Penny's in-app language (the categorize rationale framing today; Review /
 * thread copy later) is a LIVE, admin-editable persona, not a baked string. This
 * mirrors the bubble/Discord pattern: read the live body from `penny_app_persona`
 * via `get_live_app_persona`, cache it ~60s in the isolate to keep the hot path
 * fast, and fall back to APP_PERSONA_BASE when nothing is published or the read
 * fails — so behavior is never worse than the baked default.
 *
 * APP_PERSONA_BASE MUST stay in sync with the seed in
 * supabase/migrations/20260702050000_app_persona.sql.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** The baked-in default — identical to the migration seed for surface 'app'. */
export const APP_PERSONA_BASE =
  "You are Penny, an autonomous bookkeeper. Categorize one bank transaction by " +
  "choosing the single best ledger account from the chart of accounts provided. " +
  "You MUST return an account_id that appears in the list — never invent one. " +
  "Prefer income accounts for money in and expense accounts for money out. " +
  "If nothing is a good fit, pick the closest and give it a low confidence.\n\n" +
  "Write the rationale as one short, plain-language sentence a business owner " +
  "would understand — warm and specific, no jargon, no exclamation marks.";

/**
 * Q&A-appropriate baked fallback for the Penny THREAD surface. APP_PERSONA_BASE is
 * categorize-specific ("return an account_id") and wrong for the thread, so the
 * thread fn passes this as its fallback when nothing is published / the read fails.
 * It stays voice-consistent (warm, plain, no exclamation marks) but scoped to
 * answering grounded money questions from the owner's real books.
 */
export const APP_THREAD_PERSONA_BASE =
  "You are Penny, an autonomous bookkeeper talking with a business owner about their " +
  "own books. Answer questions about their income, spending, profit, and cash using " +
  "ONLY the exact figure you are given — never compute, estimate, or invent a number. " +
  "If there is no figure to give, say plainly what you can and can't answer. Write one " +
  "or two warm, plain-language sentences an owner would understand — no jargon, no " +
  "exclamation marks.";

const TTL_MS = 60_000;
type CacheEntry = { body: string; at: number };
const cache = new Map<string, CacheEntry>();

/**
 * The live persona body for a surface (default 'app'), cached ~60s. Never throws:
 * on any failure it returns the baked base so the caller always has a prompt.
 */
export async function getAppPersona(
  env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string },
  surface = "app",
  fallbackBase: string = APP_PERSONA_BASE,
): Promise<string> {
  const now = Date.now();
  const hit = cache.get(surface);
  if (hit && now - hit.at < TTL_MS) return hit.body;

  try {
    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb.rpc("get_live_app_persona", { p_surface: surface });
    const body = Array.isArray(data) ? data[0]?.body : (data as { body?: string } | null)?.body;
    if (error || !body || !String(body).trim()) {
      // Don't poison the cache on a miss — retry next request; return the base now.
      return fallbackBase;
    }
    const value = String(body);
    cache.set(surface, { body: value, at: now });
    return value;
  } catch {
    return fallbackBase;
  }
}

/** Test-only: clear the isolate cache. */
export function _resetAppPersonaCache() {
  cache.clear();
}
