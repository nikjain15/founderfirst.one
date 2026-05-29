/**
 * Build-time env vars. Same pattern as marketing — Vite inlines these
 * at build time via VITE_* prefix. If absent (local dev without .env),
 * Supabase client init falls back to preview mode.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

/**
 * Super-admin email. The only address allowed to invite or remove other
 * admins. Admin membership itself lives in the `admins` table in Supabase;
 * this constant only controls who sees the management UI.
 */
export const SUPER_ADMIN_EMAIL = "nikjain1588@gmail.com";

export const hasSupabase = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
