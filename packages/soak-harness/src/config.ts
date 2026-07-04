/**
 * Config for the load/soak harness. Every knob comes from the environment —
 * NO inline URLs, secrets, or thresholds (centralization gate). The live driver
 * refuses to run without an explicit sandbox opt-in and a namespaced fixture
 * prefix so it can never touch prod data (LEARNINGS rule 4).
 */

export interface SoakConfig {
  /** Supabase project URL (SUPABASE_URL). Empty in CI-smoke mode. */
  supabaseUrl: string;
  /** Service-role key (SUPABASE_SERVICE_ROLE_KEY). Name only ever lives here. */
  serviceRoleKey: string;
  /** Number of concurrent posters. */
  concurrency: number;
  /** Total entries to post per run. */
  totalEntries: number;
  /** How many distinct idempotency keys — replays hit the SAME key to prove the guard. */
  distinctKeys: number;
  /** Minor-unit amount used for every balanced two-line entry. */
  amountMinor: number;
  /** Fixture namespace prefix. MUST be non-empty for a live run (fence off prod). */
  fixturePrefix: string;
  /** Hard opt-in: must equal "sandbox" for the live driver to run. */
  target: string;
}

/**
 * Known production Supabase project refs that the soak driver must NEVER touch,
 * regardless of what SOAK_TARGET claims. The prod ref is well-known across the
 * repo (docs, workers, host-setup), so an operator who mislabels a prod URL as
 * "sandbox" must still be stopped. Extend this list, never the fence's trust.
 */
export const PROD_PROJECT_REFS: readonly string[] = ["ejqsfzggyfsjzrcevlnq"];

/** True when the URL points at a known production project ref (any casing/host). */
export function isProdUrl(url: string): boolean {
  const u = (url || "").toLowerCase();
  return PROD_PROJECT_REFS.some((ref) => u.includes(ref.toLowerCase()));
}

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/** Read config from the environment, applying safe CI-smoke defaults. */
export function loadConfig(env: Record<string, string | undefined> = process.env): SoakConfig {
  return {
    supabaseUrl: env.SUPABASE_URL ?? "",
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    concurrency: num(env.SOAK_CONCURRENCY, 16),
    totalEntries: num(env.SOAK_TOTAL_ENTRIES, 500),
    distinctKeys: num(env.SOAK_DISTINCT_KEYS, 250),
    amountMinor: num(env.SOAK_AMOUNT_MINOR, 10_000),
    fixturePrefix: env.SOAK_FIXTURE_PREFIX ?? "",
    target: env.SOAK_TARGET ?? "",
  };
}

/**
 * Guard a live run. Throws unless the operator has explicitly said "sandbox" AND
 * given a namespaced fixture prefix AND supplied credentials. This is the fence
 * that keeps the soak driver off prod data.
 */
export function assertLiveRunAllowed(cfg: SoakConfig): void {
  if (cfg.target !== "sandbox") {
    throw new Error(
      "refusing to run live soak: set SOAK_TARGET=sandbox to confirm this is a sandbox project (never prod)",
    );
  }
  if (!cfg.fixturePrefix || cfg.fixturePrefix.length < 4) {
    throw new Error(
      "refusing to run live soak: set SOAK_FIXTURE_PREFIX to a namespaced prefix (e.g. soak-20260704-) so fixtures are isolated and purgeable",
    );
  }
  if (!cfg.supabaseUrl || !cfg.serviceRoleKey) {
    throw new Error("refusing to run live soak: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  // Fail CLOSED on a prod URL even when the operator labelled the run "sandbox".
  // SOAK_TARGET is an operator claim; the URL is ground truth. If they disagree,
  // the URL wins and we refuse — a mislabelled prod flood is the worst outcome.
  if (isProdUrl(cfg.supabaseUrl)) {
    throw new Error(
      "refusing to run live soak: SUPABASE_URL points at a known PRODUCTION project ref — the soak driver must never touch prod, no matter what SOAK_TARGET says",
    );
  }
}
