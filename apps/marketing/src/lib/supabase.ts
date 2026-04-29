/**
 * Supabase client + waitlist RPC wrappers.
 *
 * Signup goes through the SECURITY DEFINER RPC `signup_to_waitlist` — the
 * anon key has no direct read access to the waitlist table (which would
 * expose every signup email). The RPC handles slug allocation and
 * duplicate-email recovery server-side.
 *
 * If env vars are absent (preview / local dev without .env.local),
 * `signupToWaitlist` returns a synthetic local-only result so the UI flow
 * still works without writing to the real database.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, hasSupabase } from "./env";
import { makeSlug } from "./referral";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!hasSupabase) return null;
  if (client) return client;
  try {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return client;
  } catch (err) {
    console.warn("[supabase] init failed — check VITE_SUPABASE_URL.", err);
    return null;
  }
}

export interface SignupArgs {
  email: string;
  source: string;
  referredBy: string | null;
}

export interface SignupResult {
  slug: string;
  alreadyOnList: boolean;
  /** True if this came from the real RPC; false in preview/local-only mode. */
  persisted: boolean;
}

interface SignupRow {
  slug?: string | null;
  already_on_list?: boolean | null;
}

export async function signupToWaitlist(args: SignupArgs): Promise<SignupResult> {
  const db = getClient();
  if (!db) {
    // Preview / dev without env: synthesize a slug so the rest of the flow works.
    const slug = makeSlug(args.email);
    console.info("[supabase] preview mode — not persisted. slug:", slug);
    return { slug, alreadyOnList: false, persisted: false };
  }

  const slugSeed = makeSlug(args.email).split("-")[0] ?? null;
  const { data, error } = await db.rpc("signup_to_waitlist", {
    p_email:        args.email,
    p_source:       args.source,
    p_referred_by:  args.referredBy,
    p_slug_seed:    slugSeed,
  });

  if (error) {
    throw new Error(`signup_to_waitlist failed: ${error.message}`);
  }

  const row: SignupRow | undefined = Array.isArray(data) ? data[0] : (data as SignupRow);
  const slug = row?.slug ?? null;
  if (!slug) throw new Error("signup_to_waitlist returned no slug");

  return {
    slug,
    alreadyOnList: !!row?.already_on_list,
    persisted: true,
  };
}

export async function getReferralCount(slug: string): Promise<number | null> {
  const db = getClient();
  if (!db || !slug) return null;
  const { data, error } = await db.rpc("referral_count", { p_slug: slug });
  if (error) return null;
  const n = Number(data);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(n, 12));
}
