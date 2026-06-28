/**
 * Supabase client for the unified app. Reads go through this client under the
 * caller's scoped JWT, so RLS (Phase 0) isolates tenants automatically. Money
 * mutations will go through the typed Edge-Function write-path, not this client.
 *
 * Left untyped for now; we adopt a generated Database type once apps/app has a
 * typed client home (deferred from Phase 0 — see ARCHITECTURE.md / LEARNINGS #11).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, hasSupabase } from "./env";

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!hasSupabase) {
    throw new Error(
      "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
