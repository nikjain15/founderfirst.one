import { useQuery } from "@tanstack/react-query";
import {
  getWaitlistDaily,
  getWaitlistSources,
  getWaitlistLeaderboard,
  type WaitlistDailyRow,
  type WaitlistSourceRow,
  type WaitlistLeaderRow,
} from "../lib/supabase";
import { HBarBreakdown } from "../lib/charts";
import { IconAlert } from "../lib/icons";

export function AnalyticsWaitlist() {
  const dailyQ = useQuery({ queryKey: ["waitlistDaily", 30], queryFn: () => getWaitlistDaily(30) });
  const sourcesQ = useQuery({ queryKey: ["waitlistSources"], queryFn: getWaitlistSources });
  const leadersQ = useQuery({ queryKey: ["waitlistLeaderboard", 10], queryFn: () => getWaitlistLeaderboard(10) });

  const loading = dailyQ.isPending || sourcesQ.isPending || leadersQ.isPending;
  const error = dailyQ.error || sourcesQ.error || leadersQ.error;
  const daily: WaitlistDailyRow[] = dailyQ.data ?? [];
  const sources: WaitlistSourceRow[] = sourcesQ.data ?? [];
  const leaders: WaitlistLeaderRow[] = leadersQ.data ?? [];

  const total = sources.reduce((s, r) => s + r.signups, 0);
  const last7 = daily.slice(-7).reduce((s, r) => s + r.signups, 0);
  const prev7 = daily.slice(-14, -7).reduce((s, r) => s + r.signups, 0);
  const delta = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;

  if (loading) return <div className="empty">Loading…</div>;
  if (error) {
    return (
      <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
        <IconAlert size={18} />
        <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load waitlist analytics.</p>
        {error.message}
      </div>
    );
  }

  return (
    <>
      <div className="kpi-strip">
        <Kpi label="Total signups" value={total} />
        <Kpi label="Last 7 days"  value={last7} sub={delta != null ? `${delta >= 0 ? "+" : ""}${delta}% vs prev 7d` : undefined} />
        <Kpi label="Sources"      value={sources.length} />
        <Kpi label="Referrers"    value={leaders.length} />
      </div>

      <section style={{ marginTop: 28 }}>
        <h2 className="section-title">Signups per day</h2>
        <p className="section-sub">Last 30 days.</p>
        <SignupSparkline rows={daily} />
      </section>

      <div className="analytics-two-col">
        <section>
          <h2 className="section-title">Top sources</h2>
          <p className="section-sub">Where signups are coming from.</p>
          <HBarBreakdown
            items={sources.map((s) => ({ key: s.source, label: s.source, value: s.signups }))}
          />
        </section>

        <section>
          <h2 className="section-title">Referral leaderboard</h2>
          <p className="section-sub">Top 10 referrers by people they brought in.</p>
          {leaders.length === 0 ? (
            <div className="empty-inline">No referrals yet.</div>
          ) : (
            <HBarBreakdown
              items={leaders.map((l) => ({
                key: l.referrer_slug,
                label: l.referrer_email ?? l.referrer_slug,
                value: l.referred_count,
              }))}
            />
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="kpi-tile">
      <div className="kpi-tile-label">{label}</div>
      <div className="kpi-tile-value">{value}{sub && <span className="kpi-tile-sub"> · {sub}</span>}</div>
    </div>
  );
}

/**
 * Minimal SVG sparkline for daily signups. Fills missing days with 0 so the
 * x-axis stays evenly spaced. No external chart lib — keeps bundle small.
 */
function SignupSparkline({ rows }: { rows: WaitlistDailyRow[] }) {
  // Fill missing days
  const map = new Map(rows.map((r) => [r.day, r.signups]));
  const today = new Date();
  const filled: Array<{ day: string; signups: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    filled.push({ day: iso, signups: map.get(iso) ?? 0 });
  }
  const max = Math.max(1, ...filled.map((r) => r.signups));
  const W = 720, H = 140, P = 10;
  const stepX = (W - 2 * P) / (filled.length - 1);
  const points = filled.map((r, i) => {
    const x = P + i * stepX;
    const y = H - P - (r.signups / max) * (H - 2 * P);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="sparkline">
        <polyline points={points} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
        {filled.map((r, i) => {
          const x = P + i * stepX;
          const y = H - P - (r.signups / max) * (H - 2 * P);
          return r.signups > 0
            ? <circle key={i} cx={x} cy={y} r={2.5} fill="var(--ink)"><title>{r.day}: {r.signups}</title></circle>
            : null;
        })}
      </svg>
      <div className="sparkline-axis">
        <span>{filled[0].day.slice(5)}</span>
        <span style={{ color: "var(--ink-3)" }}>peak {max}/day</span>
        <span>{filled[filled.length - 1].day.slice(5)}</span>
      </div>
    </div>
  );
}
