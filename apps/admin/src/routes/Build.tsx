/**
 * Build — the build-loop dashboard (LOOP-1).
 *
 * One page to be up to speed on the autonomous build loop in ≤15 min, without
 * hopping between chats (Roadmap §4.7). Reads loop_runs / loop_events (written by
 * the loop-heartbeat edge fn) and shows, top-down:
 *   1. Waiting on Nik  — open PRs (awaiting merge) + blocked/decision-needed cards
 *   2. Now running     — live sessions with their current step
 *   3. Cards by status — the whole loop at a glance
 *   4. Shipped (24h)   — what merged/finished in the last day
 *   5. Recent activity — the step log
 *
 * A heartbeat >30 min stale reads as ⚠ dead (loopStatus.STALE_BEAT_MS). Polls
 * every 60s (React Query). All derivation is in lib/loopStatus.ts (unit-tested).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listLoopRuns, listLoopEvents } from "../lib/supabase";
import {
  partitionRuns,
  shippedLast24h,
  relativeAge,
  type LoopRun,
} from "../lib/loopStatus";
import { IconAlert, IconExternalLink } from "../lib/icons";

const POLL_MS = 60_000;

export function Build() {
  const { data: runs = [], isPending, error } = useQuery({
    queryKey: ["loopRuns"],
    queryFn: listLoopRuns,
    refetchInterval: POLL_MS,
  });
  const { data: events = [] } = useQuery({
    queryKey: ["loopEvents"],
    queryFn: () => listLoopEvents(40),
    refetchInterval: POLL_MS,
  });

  const part = useMemo(() => partitionRuns(runs), [runs]);
  const shipped = useMemo(() => shippedLast24h(runs), [runs]);

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · build loop</div>
      <h1 className="page-title">What the loop is doing.</h1>
      <p className="page-sub">
        Every build session heartbeats here. See what needs you, what's running now, and what
        shipped — no chat-hopping. Refreshes every minute; a beat over 30 minutes stale reads as dead.
      </p>

      {isPending && <div className="empty">Loading…</div>}

      {error && (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load the loop.</p>
          {error.message}
          <p style={{ marginTop: 10, fontSize: "var(--fs-eyebrow)" }}>
            If this says the relation is missing, the <code>loop_runs</code> migration hasn't been applied yet.
          </p>
        </div>
      )}

      {!isPending && !error && runs.length === 0 && (
        <div className="empty">
          <p className="empty-title">No sessions yet.</p>
          Once a build session posts a heartbeat, it lands here live.
        </div>
      )}

      {!isPending && !error && runs.length > 0 && (
        <>
          {/* 1. Waiting on Nik — top of page (the "now what") */}
          <section className="analytics-section">
            <div className="section-head">
              <div className="eyebrow">Needs you</div>
              <h2 className="section-title">Waiting on Nik.</h2>
            </div>
            {part.waitingOnNik.length === 0 ? (
              <p className="build-clear">Nothing waiting — the loop is clear.</p>
            ) : (
              <div className="build-list">
                {part.waitingOnNik.map((r) => (
                  <WaitingCard key={r.session_tag} run={r} />
                ))}
              </div>
            )}
          </section>

          {/* 2. Now running */}
          <section className="analytics-section">
            <div className="section-head">
              <div className="eyebrow">Live</div>
              <h2 className="section-title">Running now.</h2>
            </div>
            {part.nowRunning.length === 0 && part.dead.length === 0 ? (
              <p className="build-clear">No sessions running.</p>
            ) : (
              <div className="build-list">
                {part.nowRunning.map((r) => <RunningCard key={r.session_tag} run={r} live />)}
                {part.dead.map((r) => <RunningCard key={r.session_tag} run={r} live={false} />)}
              </div>
            )}
          </section>

          {/* 3. Cards by status */}
          <section className="analytics-section">
            <div className="section-head">
              <div className="eyebrow">Overview</div>
              <h2 className="section-title">Cards by status.</h2>
            </div>
            <div className="build-status-grid">
              <StatusTile label="Running" count={part.nowRunning.length} tone="live" />
              <StatusTile label="⚠ Dead" count={part.dead.length} tone="dead" />
              <StatusTile label="PR open" count={part.waitingOnNik.filter((r) => r.status === "pr-open").length} tone="warn" />
              <StatusTile label="Blocked" count={part.waitingOnNik.filter((r) => r.status === "blocked").length} tone="warn" />
              <StatusTile label="Done" count={part.done.length} tone="done" />
            </div>
          </section>

          {/* 4. Shipped in the last 24h */}
          <section className="analytics-section">
            <div className="section-head">
              <div className="eyebrow">Momentum</div>
              <h2 className="section-title">Shipped in the last 24 hours.</h2>
            </div>
            {shipped.length === 0 ? (
              <p className="build-clear">Nothing finished in the last day.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Card</th><th>Session</th><th>Finished</th><th>PR</th></tr>
                  </thead>
                  <tbody>
                    {shipped.map((r) => (
                      <tr key={r.session_tag}>
                        <td>{r.card ?? "—"}</td>
                        <td className="build-tag">{r.session_tag}</td>
                        <td>{relativeAge(r.updated_at)}</td>
                        <td>{r.pr_url ? <PrLink url={r.pr_url} /> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 5. Recent activity — the step log */}
          {events.length > 0 && (
            <section className="analytics-section">
              <div className="section-head">
                <div className="eyebrow">Log</div>
                <h2 className="section-title">Recent activity.</h2>
              </div>
              <ul className="build-log">
                {events.map((e) => (
                  <li key={e.id} className="build-log-row">
                    <span className="build-log-time">{relativeAge(e.at)}</span>
                    <span className="build-tag">{e.session_tag}</span>
                    <span className="build-log-msg">{e.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ---- bits ------------------------------------------------------------------ */

function WaitingCard({ run }: { run: LoopRun }) {
  const isPr = run.status === "pr-open";
  return (
    <div className="build-card build-card-wait">
      <div className="build-card-head">
        <span className="build-card-card">{run.card ?? run.session_tag}</span>
        <span className={`build-pill ${isPr ? "warn" : "dead"}`}>
          {isPr ? "PR awaiting merge" : "Blocked"}
        </span>
      </div>
      <p className="build-card-detail">
        {isPr
          ? "Review and merge to unblock the loop."
          : run.blocked_reason ?? "Needs a decision."}
      </p>
      <div className="build-card-foot">
        <span className="build-tag">{run.session_tag}</span>
        {run.pr_url && <PrLink url={run.pr_url} />}
      </div>
    </div>
  );
}

function RunningCard({ run, live }: { run: LoopRun; live: boolean }) {
  return (
    <div className={`build-card ${live ? "build-card-live" : "build-card-dead"}`}>
      <div className="build-card-head">
        <span className="build-card-card">{run.card ?? run.session_tag}</span>
        <span className={`build-pill ${live ? "live" : "dead"}`}>
          {live ? "● live" : "⚠ dead"}
        </span>
      </div>
      <p className="build-card-detail">{run.phase ?? "…"}</p>
      <div className="build-card-foot">
        <span className="build-tag">{run.session_tag}</span>
        <span className="build-card-role">{run.role}</span>
        <span className="build-card-beat">beat {relativeAge(run.last_beat)}</span>
      </div>
    </div>
  );
}

function StatusTile({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className={`build-tile build-tile-${tone}`}>
      <span className="build-tile-num num">{count}</span>
      <span className="build-tile-label">{label}</span>
    </div>
  );
}

function PrLink({ url }: { url: string }) {
  return (
    <a className="btn-link" href={url} target="_blank" rel="noreferrer">
      Open PR <IconExternalLink size={12} />
    </a>
  );
}
