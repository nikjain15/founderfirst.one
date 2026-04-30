/**
 * Build-time environment, exposed by Vite as import.meta.env.VITE_*.
 *
 * Read once and re-export. Components should depend on `hasSupabase` /
 * `hasAnalytics` rather than null-checking each var themselves.
 *
 * Configure via apps/marketing/.env.local (copy from .env.example).
 */

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_GA_ID?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const env = import.meta.env;

export const SUPABASE_URL      = env.VITE_SUPABASE_URL      ?? "";
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? "";
export const POSTHOG_KEY       = env.VITE_POSTHOG_KEY       ?? "";
export const POSTHOG_HOST      = env.VITE_POSTHOG_HOST      ?? "https://us.i.posthog.com";
export const GA_ID             = env.VITE_GA_ID             ?? "";

export const hasSupabase  = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
export const hasAnalytics = POSTHOG_KEY.length > 0;
export const hasGa        = GA_ID.length > 0;

export const isDev  = env.DEV;
export const isProd = env.PROD;
