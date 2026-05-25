/*
 * Lightweight inline-SVG charts. No deps. Style matches marketing site
 * (currentColor strokes, ink fills, subtle baselines).
 *
 * - DualBarChart: side-by-side bars per day (opens vs resolves).
 * - HBar: single horizontal bar for proportional breakdowns (channel/priority).
 */

type Point = { day: string; count: number };

export function DualBarChart({
  series,
  height = 140,
  labelA = "A",
  labelB = "B",
}: {
  series: Array<{ day: string; a: number; b: number }>;
  height?: number;
  labelA?: string;
  labelB?: string;
}) {
  const w = 720;
  const h = height;
  const padX = 24;
  const padTop = 12;
  const padBottom = 26;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;
  const n = Math.max(series.length, 1);
  const groupW = innerW / n;
  const barW = Math.max(4, Math.min(14, groupW * 0.34));
  const max = Math.max(1, ...series.flatMap((d) => [d.a, d.b]));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${labelA} vs ${labelB} over time`}>
        {/* baseline */}
        <line
          x1={padX}
          x2={w - padX}
          y1={h - padBottom}
          y2={h - padBottom}
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="1"
        />
        {series.map((d, i) => {
          const cx = padX + groupW * i + groupW / 2;
          const ha = (d.a / max) * innerH;
          const hb = (d.b / max) * innerH;
          return (
            <g key={d.day}>
              <rect
                x={cx - barW - 1}
                y={h - padBottom - ha}
                width={barW}
                height={ha}
                fill="var(--ink)"
                rx="2"
              />
              <rect
                x={cx + 1}
                y={h - padBottom - hb}
                width={barW}
                height={hb}
                fill="var(--ink-4)"
                rx="2"
              />
              {(i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2)) && (
                <text
                  x={cx}
                  y={h - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--ink-4)"
                  fontFamily="var(--sans)"
                >
                  {fmtShort(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        <span><span className="dot dot-ink" /> {labelA}</span>
        <span><span className="dot dot-ink-4" /> {labelB}</span>
      </div>
    </div>
  );
}

export function HBarBreakdown({
  items,
  total,
}: {
  items: Array<{ key: string; label: string; value: number }>;
  total?: number;
}) {
  const sum = total ?? items.reduce((s, x) => s + x.value, 0);
  return (
    <div className="hbar-list">
      {items.map((x) => {
        const pct = sum > 0 ? (x.value / sum) * 100 : 0;
        return (
          <div key={x.key} className="hbar-row">
            <div className="hbar-meta">
              <span className="hbar-label">{x.label}</span>
              <span className="hbar-value">
                {x.value} <span className="hbar-pct">· {Math.round(pct)}%</span>
              </span>
            </div>
            <div className="hbar-track">
              <div className="hbar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      {items.length === 0 && <div className="empty-inline">No data yet.</div>}
    </div>
  );
}

function fmtShort(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Helper used by call sites to merge opens + resolves series.
export function zipOpensResolves(
  opens: Point[],
  resolves: Point[],
): Array<{ day: string; a: number; b: number }> {
  const map = new Map<string, { a: number; b: number }>();
  for (const p of opens) map.set(p.day, { a: p.count, b: 0 });
  for (const p of resolves) {
    const cur = map.get(p.day) ?? { a: 0, b: 0 };
    cur.b = p.count;
    map.set(p.day, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, ...v }));
}
