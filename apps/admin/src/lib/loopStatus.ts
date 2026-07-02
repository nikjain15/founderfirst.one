/**
 * loopStatus — pure derivation logic for the Build dashboard (LOOP-1).
 *
 * Kept free of React/Supabase so the live-vs-⚠dead threshold is unit-testable
 * (see loopStatus.test.ts). The one magic number that governs behaviour — how
 * stale a heartbeat may be before a session reads as dead — lives here as a named
 * constant, not sprinkled through the UI (centralization gate).
 */

/** A beat older than this reads as ⚠ dead. Spec §4.7: >30 min stale = dead. */
export const STALE_BEAT_MS = 30 * 60 * 1000;

export type LoopRun = {
  session_tag: string;
  role: string;
  card: string | null;
  phase: string | null;
  status: "running" | "pr-open" | "blocked" | "red-teaming" | "done";
  pr_url: string | null;
  blocked_reason: string | null;
  started_at: string;
  last_beat: string;
  updated_at: string;
};

export type Liveness = "live" | "dead";

/** live if the last heartbeat is within STALE_BEAT_MS of `now`; else dead. */
export function liveness(lastBeatIso: string, now: number = Date.now()): Liveness {
  const beat = new Date(lastBeatIso).getTime();
  if (Number.isNaN(beat)) return "dead";
  return now - beat <= STALE_BEAT_MS ? "live" : "dead";
}

/** True while the session is doing work AND still beating — the "now-running" set. */
export function isNowRunning(run: LoopRun, now: number = Date.now()): boolean {
  if (run.status === "done") return false;
  return liveness(run.last_beat, now) === "live";
}

/**
 * Partition runs for the dashboard. A run counts as "waiting on Nik" when it has
 * an open PR (awaiting merge) or is blocked (a decision is needed) — these are the
 * two things only Nik can clear, surfaced at the top of the page (spec §4.7).
 */
export type LoopPartition = {
  waitingOnNik: LoopRun[];   // pr-open or blocked
  nowRunning: LoopRun[];     // live and not done
  dead: LoopRun[];           // not done, beat stale
  done: LoopRun[];           // finished this cycle
};

export function partitionRuns(runs: LoopRun[], now: number = Date.now()): LoopPartition {
  const waitingOnNik: LoopRun[] = [];
  const nowRunning: LoopRun[] = [];
  const dead: LoopRun[] = [];
  const done: LoopRun[] = [];

  for (const r of runs) {
    if (r.status === "done") { done.push(r); continue; }
    if (r.status === "pr-open" || r.status === "blocked") { waitingOnNik.push(r); continue; }
    if (liveness(r.last_beat, now) === "live") nowRunning.push(r);
    else dead.push(r);
  }
  return { waitingOnNik, nowRunning, dead, done };
}

/** Shipped in the last 24h — the "last-24h shipped" list (spec §4.7). */
export function shippedLast24h(runs: LoopRun[], now: number = Date.now()): LoopRun[] {
  const DAY = 24 * 60 * 60 * 1000;
  return runs.filter((r) => r.status === "done" && now - new Date(r.updated_at).getTime() <= DAY);
}

/** Compact "3m ago" / "2h ago" relative label for a heartbeat timestamp. */
export function relativeAge(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
