/**
 * Build-time env. Same Supabase project/keys as the other surfaces (set in
 * pages.yml). Anon key only — all privileged access is via RLS + the write-path
 * API. `hasSupabase` lets the UI degrade gracefully when unset (preview mode).
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_URL = url ?? "";
export const SUPABASE_ANON_KEY = anon ?? "";
export const hasSupabase = Boolean(url && anon);

// Cloudflare Turnstile site key (card SEC-2) — public by design, still sourced
// from env rather than inlined. Unset in local/preview envs degrades the login
// form to captcha-optional, same as `hasSupabase` degrading to preview mode.
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
export const TURNSTILE_SITE_KEY = turnstileSiteKey ?? "";
export const hasTurnstile = Boolean(turnstileSiteKey);
