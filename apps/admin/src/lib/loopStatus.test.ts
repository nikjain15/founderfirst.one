import { describe, it, expect } from "vitest";
import {
  STALE_BEAT_MS,
  liveness,
  isNowRunning,
  partitionRuns,
  shippedLast24h,
  relativeAge,
  type LoopRun,
} from "./loopStatus";

const NOW = new Date("2026-07-02T12:00:00.000Z").getTime();
const agoMs = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

function run(overrides: Partial<LoopRun>): LoopRun {
  return {
    session_tag: "loop-1",
    role: "builder",
    card: "LOOP-1",
    phase: "building",
    status: "running",
    pr_url: null,
    blocked_reason: null,
    started_at: agoMs(60 * MIN),
    last_beat: agoMs(1 * MIN),
    updated_at: agoMs(1 * MIN),
    ...overrides,
  };
}

describe("liveness — the 30-min stale threshold", () => {
  it("a fresh beat is live", () => {
    expect(liveness(agoMs(5 * MIN), NOW)).toBe("live");
  });
  it("a beat exactly at the threshold is still live", () => {
    expect(liveness(agoMs(STALE_BEAT_MS), NOW)).toBe("live");
  });
  it("a beat one minute past the threshold is dead", () => {
    expect(liveness(agoMs(STALE_BEAT_MS + MIN), NOW)).toBe("dead");
  });
  it("a >30-min-stale beat reads as dead (acceptance a)", () => {
    expect(liveness(agoMs(31 * MIN), NOW)).toBe("dead");
  });
  it("an unparseable timestamp is treated as dead, not live", () => {
    expect(liveness("not-a-date", NOW)).toBe("dead");
  });
});

describe("isNowRunning", () => {
  it("live + running is now-running", () => {
    expect(isNowRunning(run({ last_beat: agoMs(2 * MIN) }), NOW)).toBe(true);
  });
  it("a done session is never now-running even if freshly beat", () => {
    expect(isNowRunning(run({ status: "done", last_beat: agoMs(1 * MIN) }), NOW)).toBe(false);
  });
  it("a stale running session is not now-running (it's dead)", () => {
    expect(isNowRunning(run({ last_beat: agoMs(45 * MIN) }), NOW)).toBe(false);
  });
});

describe("partitionRuns", () => {
  it("routes pr-open and blocked to waiting-on-Nik (acceptance b)", () => {
    const runs = [
      run({ session_tag: "a", status: "pr-open", pr_url: "https://x/1" }),
      run({ session_tag: "b", status: "blocked", blocked_reason: "needs decision" }),
      run({ session_tag: "c", status: "running", last_beat: agoMs(2 * MIN) }),
    ];
    const p = partitionRuns(runs, NOW);
    expect(p.waitingOnNik.map((r) => r.session_tag).sort()).toEqual(["a", "b"]);
    expect(p.nowRunning.map((r) => r.session_tag)).toEqual(["c"]);
  });
  it("a running session with a stale beat lands in dead, not now-running", () => {
    const p = partitionRuns([run({ status: "running", last_beat: agoMs(40 * MIN) })], NOW);
    expect(p.dead).toHaveLength(1);
    expect(p.nowRunning).toHaveLength(0);
  });
  it("a live posting session appears in now-running (acceptance a)", () => {
    const p = partitionRuns([run({ last_beat: agoMs(30 * 1000) })], NOW);
    expect(p.nowRunning).toHaveLength(1);
    expect(p.dead).toHaveLength(0);
  });
  it("done sessions go to done, never waiting-on-Nik", () => {
    const p = partitionRuns([run({ status: "done" })], NOW);
    expect(p.done).toHaveLength(1);
    expect(p.waitingOnNik).toHaveLength(0);
  });
});

describe("shippedLast24h", () => {
  it("includes done sessions updated within 24h", () => {
    const runs = [
      run({ session_tag: "recent", status: "done", updated_at: agoMs(3 * 60 * MIN) }),
      run({ session_tag: "old", status: "done", updated_at: agoMs(30 * 60 * MIN) }),
      run({ session_tag: "running", status: "running" }),
    ];
    expect(shippedLast24h(runs, NOW).map((r) => r.session_tag)).toEqual(["recent"]);
  });
});

describe("relativeAge", () => {
  it("formats minutes and hours", () => {
    expect(relativeAge(agoMs(3 * MIN), NOW)).toBe("3m ago");
    expect(relativeAge(agoMs(2 * 60 * MIN), NOW)).toBe("2h ago");
    expect(relativeAge(agoMs(20 * 1000), NOW)).toBe("just now");
  });
});
