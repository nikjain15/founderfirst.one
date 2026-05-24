/**
 * Build-time env vars. Same pattern as marketing — Vite inlines these
 * at build time via VITE_* prefix. If absent (local dev without .env),
 * Supabase client init falls back to preview mode.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

/**
 * Allowed admin email. Only this address can sign in. Set via
 * VITE_ADMIN_EMAIL at build time. If empty, any authenticated email works
 * (useful for local dev).
 */
export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL ?? "").toLowerCase();

export const hasSupabase = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
