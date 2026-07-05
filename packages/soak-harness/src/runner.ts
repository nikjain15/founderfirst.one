/**
 * Backend-agnostic concurrency runner + invariant assertions.
 *
 * The same run() drives either the in-memory model (CI smoke) or the live
 * Supabase driver — both implement PostBackend. The point of the harness is the
 * assertions in assertLedgerInvariants(): under a concurrent flood where many
 * calls share the SAME idempotency key, exactly one row per key may exist and the
 * books must still tie.
 */

import { Metrics } from "./metrics.ts";
import type { Line, PostRequest } from "./model.ts";

export interface PostBackend {
  /** Post (or replay) an entry. Returns whether THIS call created the row. */
  post(req: PostRequest): Promise<{ id: string; created: boolean }>;
}

export interface RunPlan {
  org_id: string;
  concurrency: number;
  totalEntries: number;
  /** Idempotency keys cycle over this many values — collisions force replays. */
  distinctKeys: number;
  amountMinor: number;
  /** Namespace so ids/keys are isolated per run. */
  prefix: string;
}

export interface RunReport {
  plan: RunPlan;
  attempted: number;
  created: number;
  replayed: number;
  /** created must equal distinctKeys used — proof no double-post. */
  distinctKeysUsed: number;
  metrics: ReturnType<Metrics["summary"]>;
}

function balancedLines(org: string, amountMinor: number): Line[] {
  return [
    { account_id: `${org}-cash`, side: "D", amount_minor: amountMinor },
    { account_id: `${org}-rev`, side: "C", amount_minor: amountMinor },
  ];
}

/** Drive `totalEntries` posts at `concurrency`, cycling `distinctKeys` idem keys. */
export async function run(backend: PostBackend, plan: RunPlan): Promise<RunReport> {
  const metrics = new Metrics();
  let created = 0;
  let replayed = 0;
  const usedKeys = new Set<string>();

  // Build the work list first: index i → idempotency key (i mod distinctKeys).
  const work: PostRequest[] = [];
  for (let i = 0; i < plan.totalEntries; i++) {
    const key = `${plan.prefix}idem-${i % plan.distinctKeys}`;
    usedKeys.add(key);
    work.push({ org_id: plan.org_id, idempotency_key: key, lines: balancedLines(plan.org_id, plan.amountMinor) });
  }

  // Worker pool: `concurrency` workers pull from a shared cursor. Interleaving the
  // same-key requests across workers is what exercises the race.
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      if (i >= work.length) return;
      const t0 = performance.now();
      try {
        const r = await backend.post(work[i]);
        const ms = performance.now() - t0;
        metrics.record({ ok: true, ms });
        if (r.created) created++;
        else replayed++;
      } catch (e) {
        metrics.record({ ok: false, ms: performance.now() - t0, reason: (e as Error).message.slice(0, 40) });
      }
    }
  };
  await Promise.all(Array.from({ length: plan.concurrency }, worker));

  return {
    plan,
    attempted: work.length,
    created,
    replayed,
    distinctKeysUsed: usedKeys.size,
    metrics: metrics.summary(),
  };
}

export interface InvariantCheck {
  name: string;
  pass: boolean;
  detail: string;
}

/**
 * The load-bearing assertions. Given a run report + the observed tie-out, verify:
 *   1. no double-post: exactly one created row per distinct idempotency key.
 *   2. every attempt resolved (created + replayed == attempted, zero errors).
 *   3. tie-out holds: Σ debits == Σ credits.
 */
export function assertLedgerInvariants(
  report: RunReport,
  tieOut: { debits: number; credits: number; balanced: boolean },
): InvariantCheck[] {
  return [
    {
      name: "no_double_post",
      pass: report.created === report.distinctKeysUsed,
      detail: `created=${report.created} distinctKeys=${report.distinctKeysUsed} (must be equal)`,
    },
    {
      name: "all_resolved_no_errors",
      pass: report.created + report.replayed === report.attempted && report.metrics.errors === 0,
      detail: `created+replayed=${report.created + report.replayed} attempted=${report.attempted} errors=${report.metrics.errors}`,
    },
    {
      name: "tie_out_balances",
      pass: tieOut.balanced,
      detail: `debits=${tieOut.debits} credits=${tieOut.credits}`,
    },
  ];
}
