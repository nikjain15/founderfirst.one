/**
 * Build-time env vars. Same pattern as marketing — Vite inlines these
 * at build time via VITE_* prefix. If absent (local dev without .env),
 * Supabase client init falls back to preview mode.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const hasSupabase = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

// Cloudflare Turnstile site key (card SEC-2) — public by design, still sourced
// from env rather than inlined. Unset in local/preview envs degrades the login
// form to captcha-optional, same as `hasSupabase` degrading to preview mode.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
export const hasTurnstile = !!TURNSTILE_SITE_KEY;
