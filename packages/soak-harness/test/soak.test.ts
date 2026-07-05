import { describe, it, expect } from "vitest";
import { LedgerModel, PlaidIngestModel, UnbalancedError } from "../src/model.ts";
import { run, assertLedgerInvariants, type RunPlan, type PostBackend } from "../src/runner.ts";

// A PostBackend backed by the in-memory ledger model. This is the CI-safe target:
// the SAME runner + assertions used against the live RPC, driven at small N.
class ModelBackend implements PostBackend {
  constructor(readonly model: LedgerModel) {}
  async post(req: Parameters<PostBackend["post"]>[0]) {
    const e = await this.model.post(req);
    return { id: e.id, created: e.created };
  }
}

const smokePlan = (over: Partial<RunPlan> = {}): RunPlan => ({
  org_id: "org-smoke",
  concurrency: 16,
  totalEntries: 400,
  distinctKeys: 100, // 400 posts over 100 keys ⇒ every key is replayed 3x
  amountMinor: 10_000,
  prefix: "smoke-",
  ...over,
});

describe("soak harness — ledger invariants under concurrency (CI smoke)", () => {
  it("no double-post: concurrent floods on shared idempotency keys collapse to one row per key", async () => {
    const model = new LedgerModel();
    const plan = smokePlan();
    const report = await run(new ModelBackend(model), plan);

    // exactly distinctKeys rows created; the rest were replays
    expect(report.created).toBe(plan.distinctKeys);
    expect(report.replayed).toBe(plan.totalEntries - plan.distinctKeys);
    expect(model.entries().length).toBe(plan.distinctKeys);
    expect(report.metrics.errors).toBe(0);
  });

  it("tie-out holds after the whole flood: Σ debits == Σ credits", async () => {
    const model = new LedgerModel();
    const report = await run(new ModelBackend(model), smokePlan());
    const tie = model.tieOut();
    expect(tie.balanced).toBe(true);

    const checks = assertLedgerInvariants(report, tie);
    for (const c of checks) expect(c.pass, `${c.name}: ${c.detail}`).toBe(true);
  });

  it("records latency percentiles for every attempt", async () => {
    const model = new LedgerModel();
    const report = await run(new ModelBackend(model), smokePlan());
    expect(report.metrics.count).toBe(400);
    expect(report.metrics.p50).toBeGreaterThanOrEqual(0);
    expect(report.metrics.p99).toBeGreaterThanOrEqual(report.metrics.p50);
  });

  it("scales the assertion to higher concurrency / more keys without a double-post", async () => {
    const model = new LedgerModel();
    const plan = smokePlan({ concurrency: 32, totalEntries: 1000, distinctKeys: 400 });
    const report = await run(new ModelBackend(model), plan);
    expect(report.created).toBe(400);
    expect(report.created).toBe(report.distinctKeysUsed);
  });

  it("rejects an unbalanced entry (belt check mirrors the RPC contract)", async () => {
    const model = new LedgerModel();
    await expect(
      model.post({
        org_id: "org-smoke",
        idempotency_key: "bad",
        lines: [
          { account_id: "a", side: "D", amount_minor: 100 },
          { account_id: "b", side: "C", amount_minor: 99 },
        ],
      }),
    ).rejects.toBeInstanceOf(UnbalancedError);
  });
});

// A DELIBERATELY BROKEN backend: it ignores the idempotency key and mints a fresh
// row on every call (the double-reversal / lock-free P0 class from LEARNINGS). If
// the assertions have teeth, this MUST make assertLedgerInvariants fail — proving
// the harness would actually catch a real double-post rather than rubber-stamp it.
class DoublePostingBackend implements PostBackend {
  private seq = 0;
  async post(_req: Parameters<PostBackend["post"]>[0]) {
    await Promise.resolve();
    return { id: `dup-${this.seq++}`, created: true };
  }
}

describe("soak harness — the assertion has teeth (negative control)", () => {
  it("assertLedgerInvariants FAILS no_double_post when a backend double-posts", async () => {
    const plan = smokePlan();
    const report = await run(new DoublePostingBackend(), plan);
    // every call reported created ⇒ created (400) != distinctKeys (100)
    expect(report.created).toBe(plan.totalEntries);
    const checks = assertLedgerInvariants(report, { debits: 1, credits: 1, balanced: true });
    const noDouble = checks.find((c) => c.name === "no_double_post");
    expect(noDouble?.pass, noDouble?.detail).toBe(false);
  });

  it("assertLedgerInvariants FAILS tie_out_balances when the books don't tie", async () => {
    const model = new LedgerModel();
    const report = await run(new ModelBackend(model), smokePlan());
    const checks = assertLedgerInvariants(report, { debits: 100, credits: 99, balanced: false });
    const tie = checks.find((c) => c.name === "tie_out_balances");
    expect(tie?.pass, tie?.detail).toBe(false);
  });
});

describe("soak harness — plaid ingest dedup under concurrency (CI smoke)", () => {
  it("re-pulled transactions are no-ops: dedup on (org, external_id)", async () => {
    const model = new PlaidIngestModel();
    // 300 ingests over 100 distinct external ids, driven concurrently
    const work = Array.from({ length: 300 }, (_, i) => `ext-${i % 100}`);
    await Promise.all(work.map((ext) => model.ingest("org-smoke", ext)));
    expect(model.distinct).toBe(100);
    expect(model.ingested).toBe(100);
    expect(model.skipped).toBe(200);
  });
});
