/**
 * CLI entrypoint for the live soak run. Sandbox-only, namespaced fixtures.
 *
 * Usage (from repo root):
 *   SOAK_TARGET=sandbox \
 *   SOAK_FIXTURE_PREFIX=soak-20260704- \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   SOAK_ORG_ID=... SOAK_ACTOR_ID=... SOAK_CASH_ACCOUNT_ID=... SOAK_REV_ACCOUNT_ID=... \
 *   pnpm --dir packages/soak-harness soak
 *
 * The fixture ids (org/actor/accounts) are supplied by the operator — the harness
 * does NOT create tenants; it drives posts into a pre-seeded sandbox org so it can
 * never accidentally spawn prod rows. Provision fixtures per
 * docs/plans/production-readiness-runbook.md § Soak fixtures.
 *
 * This file is a runtime script; it is not imported by the CI smoke test.
 */

import { loadConfig, assertLiveRunAllowed } from "./config.ts";
import { makeLiveBackend, type LiveFixtures } from "./driver.ts";
import { run, assertLedgerInvariants, type RunPlan } from "./runner.ts";

async function main(): Promise<void> {
  const cfg = loadConfig();
  assertLiveRunAllowed(cfg);

  const env = process.env;
  const fx: LiveFixtures = {
    orgId: env.SOAK_ORG_ID ?? "",
    actorId: env.SOAK_ACTOR_ID ?? "",
    cashAccountId: env.SOAK_CASH_ACCOUNT_ID ?? "",
    revAccountId: env.SOAK_REV_ACCOUNT_ID ?? "",
  };
  for (const [k, v] of Object.entries(fx)) {
    if (!v) throw new Error(`missing fixture id: ${k} (provision per the DR runbook § Soak fixtures)`);
  }

  const plan: RunPlan = {
    org_id: fx.orgId,
    concurrency: cfg.concurrency,
    totalEntries: cfg.totalEntries,
    distinctKeys: cfg.distinctKeys,
    amountMinor: cfg.amountMinor,
    prefix: cfg.fixturePrefix,
  };

  const backend = await makeLiveBackend(cfg, fx);
  // eslint-disable-next-line no-console
  console.log(`[soak] driving ${plan.totalEntries} posts @ concurrency ${plan.concurrency} against sandbox org ${fx.orgId}`);
  const report = await run(backend, plan);

  // Live tie-out is verified by re-querying the org's trial balance out-of-band
  // (the runbook documents the query); the driver asserts the no-double-post +
  // no-error invariants it can observe from the RPC responses directly.
  const checks = assertLedgerInvariants(report, { debits: 0, credits: 0, balanced: true }).filter(
    (c) => c.name !== "tie_out_balances",
  );

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ report, checks }, null, 2));
  const failed = checks.filter((c) => !c.pass);
  if (failed.length) {
    // eslint-disable-next-line no-console
    console.error(`[soak] FAILED invariants: ${failed.map((c) => c.name).join(", ")}`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log("[soak] invariants held: no double-post, no errors. Verify tie-out via the runbook query.");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(`[soak] ${(e as Error).message}`);
  process.exit(1);
});
