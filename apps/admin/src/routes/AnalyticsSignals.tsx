import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getSigAnalyticsPipeline,
  getSigAnalyticsThemes,
  type SigPipeline,
  type SigThemes,
} from "../lib/supabase";
import { HBarBreakdown } from "../lib/charts";
import { IconAlert, IconExternalLink } from "../lib/icons";
import { Takeaway } from "../lib/Takeaway";

const RANGES: Array<{ label: string; days: number }> = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 3650 },
];
const GRANS = ["day", "week", "month"] as const;

const FUNNEL_LABELS: Array<{ key: keyof SigPipeline["funnel"]; title: string; sub: string }> = [
  { key: "ingested", title: "Ingested", sub: "posts pulled in" },
  { key: "scored", title: "Scored", sub: "passed the model" },
  { key: "promoted", title: "Promoted", sub: "became leads" },
  { key: "sent", title: "Sent", sub: "outreach sent" },
  { key: "replied", title: "Replied", sub: "they responded" },
  { key: "won", title: "Won", sub: "became customers" },
];

export function AnalyticsSignals() {
  const [rangeIdx, setRangeIdx] = useState(1);
  const [gran, setGran] = useState<(typeof GRANS)[number]>("week");
  const days = RANGES[rangeIdx].days;

  const pipeQ = useQuery({ queryKey: ["sigPipe", days], queryFn: () => getSigAnalyticsPipeline(days) });
  const themesQ = useQuery({ queryKey: ["sigThemes", days, gran], queryFn: () => getSigAnalyticsThemes(days, gran) });

  if (pipeQ.isPending || themesQ.isPending) return <div className="empty">Loading…</div>;
  if (pipeQ.error || themesQ.error) {
    return (
      <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
        <IconAlert size={18} />
        <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load Signals analytics.</p>
        {(pipeQ.error || themesQ.error)?.message}
      </div>
    );
  }

  const pipe = pipeQ.data as SigPipeline;
  const themes = themesQ.data as SigThemes;
  const f = pipe.funnel;
  const delta = f.promoted - pipe.prev_promoted;
  const replyRate = f.sent > 0 ? Math.round((f.replied / f.sent) * 100) : null;
  const winRate = f.promoted > 0 ? Math.round((f.won / f.promoted) * 100) : null;

  return (
    <>
      {pipe.needs_action > 0 ? (
        <Takeaway tone="watch" action={{ label: "Work the pipeline →", to: "/audience#signals" }}>
          <strong>{pipe.needs_action}</strong> promoted lead{pipe.needs_action === 1 ? "" : "s"} still unsent — draft and send outreach.
        </Takeaway>
      ) : replyRate != null ? (
        <Takeaway tone="good" action={{ label: "Work the pipeline →", to: "/audience#signals" }}>
          Pipeline clear: <strong>{replyRate}% reply</strong>
          {winRate != null ? <>, <strong>{winRate}% win</strong></> : null}. Keep promoting strong signals.
        </Takeaway>
      ) : (
        <Takeaway tone="neutral" action={{ label: "Work the pipeline →", to: "/audience#signals" }}>
          Numbers fill in as you promote and send leads in the pipeline.
        </Takeaway>
      )}

      <div className="toolbar" style={{ marginTop: 0, marginBottom: 20 }}>
        {RANGES.map((r, i) => (
          <button key={r.label} className={`chip ${i === rangeIdx ? "active" : ""}`} onClick={() => setRangeIdx(i)} type="button">
            {r.label}
          </button>
        ))}
        <div className="toolbar-spacer" />
        <span style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-3)" }}>
          {themes.total_posts.toLocaleString()} on-topic posts
        </span>
      </div>

      {/* ---- Pipeline ---------------------------------------------------- */}
      <div className="kpi-strip">
        <div className="kpi-tile">
          <div className="kpi-tile-label">Leads promoted</div>
          <div className="kpi-tile-value">{f.promoted}</div>
          <div className="kpi-tile-sub">{delta >= 0 ? "+" : ""}{delta} vs prev</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-tile-label">Reply rate</div>
          <div className="kpi-tile-value">{replyRate == null ? "—" : `${replyRate}%`}</div>
          <div className="kpi-tile-sub">{f.sent > 0 ? `${f.replied} / ${f.sent} sent` : "mark leads sent →"}</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-tile-label">Win rate</div>
          <div className="kpi-tile-value">{winRate == null ? "—" : `${winRate}%`}</div>
          <div className="kpi-tile-sub">{f.promoted > 0 ? `${f.won} won` : "no leads yet"}</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-tile-label">Avg time to send</div>
          <div className="kpi-tile-value">{pipe.avg_days_to_send == null ? "—" : `${pipe.avg_days_to_send}d`}</div>
          <div className="kpi-tile-sub">promoted → sent</div>
        </div>
        <div className={`kpi-tile ${pipe.needs_action > 0 ? "kpi-warn" : ""}`}>
          <div className="kpi-tile-label">Needs action</div>
          <div className="kpi-tile-value">{pipe.needs_action}</div>
          <div className="kpi-tile-sub">unsent leads</div>
        </div>
      </div>

      <section style={{ marginTop: 28 }}>
        <h2 className="section-title">Pipeline funnel</h2>
        <p className="section-sub">Where posts drop off on the way to becoming customers — for the selected window.</p>
        <FunnelViz f={f} />
        {f.sent === 0 && (
          <p className="section-sub" style={{ marginTop: 10 }}>
            Reply &amp; win rates fill in as you move leads to <code>sent</code>, <code>replied</code> and <code>won</code> in the lead drawer.
          </p>
        )}
      </section>

      {/* ---- Market themes ---------------------------------------------- */}
      <div className="section-head" style={{ marginTop: 36, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 className="section-title">What the market is saying</h2>
          <p className="section-sub">Trending pains &amp; competitor frustrations across on-topic posts — raw material for features, blog, social &amp; podcast.</p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          {GRANS.map((g) => (
            <button key={g} className={`chip ${g === gran ? "active" : ""}`} onClick={() => setGran(g)} type="button">{g}</button>
          ))}
        </div>
      </div>

      <div className="analytics-two-col">
        <section>
          <h3 className="section-title" style={{ fontSize: "var(--fs-data-row)" }}>Top pains <span style={{ color: "var(--ink-3)" }}>(vs prev period)</span></h3>
          <TrendBars items={themes.pains.map((p) => ({ label: p.tag.replace(/_/g, " "), value: p.count, prev: p.prev }))} />
        </section>
        <section>
          <h3 className="section-title" style={{ fontSize: "var(--fs-data-row)" }}>Competitors named <span style={{ color: "var(--ink-3)" }}>(vs prev period)</span></h3>
          <TrendBars items={themes.competitors.map((c) => ({ label: c.name, value: c.count, prev: c.prev }))} />
        </section>
      </div>

      <section style={{ marginTop: 24 }}>
        <h3 className="section-title" style={{ fontSize: "var(--fs-data-row)" }}>Where the conversation happens</h3>
        <HBarBreakdown items={themes.platforms.map((p) => ({ key: p.platform, label: p.platform, value: p.count }))} />
      </section>

      <section style={{ marginTop: 24 }}>
        <h3 className="section-title" style={{ fontSize: "var(--fs-data-row)" }}>Voice of the market</h3>
        <p className="section-sub">Recent on-topic posts — quote-ready for content.</p>
        {themes.examples.length === 0 ? (
          <div className="empty">No on-topic posts in this window yet.</div>
        ) : (
          <div className="sig-voice">
            {themes.examples.map((ex, i) => (
              <div className="sig-voice-card" key={i}>
                <p className="sig-voice-text">{ex.snippet}{ex.snippet.length >= 220 ? "…" : ""}</p>
                <div className="sig-voice-meta">
                  <span>{ex.platform}{ex.competitor ? ` · ${ex.competitor}` : ""}{(ex.pains ?? []).length ? ` · ${(ex.pains ?? []).slice(0, 2).join(", ").replace(/_/g, " ")}` : ""}</span>
                  {ex.url && <a href={ex.url} target="_blank" rel="noreferrer">open <IconExternalLink size={12} /></a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function FunnelViz({ f }: { f: SigPipeline["funnel"] }) {
  const max = Math.max(1, f.ingested);
  const first = f.ingested;
  return (
    <div className="funnel">
      {FUNNEL_LABELS.map((row, i) => {
        const val = f[row.key];
        const widthPct = (val / max) * 100;
        const prevVal = i > 0 ? f[FUNNEL_LABELS[i - 1].key] : null;
        const stepPct = prevVal && prevVal > 0 ? Math.round((val / prevVal) * 100) : null;
        const overallPct = first > 0 ? Math.round((val / first) * 100) : 0;
        return (
          <div key={row.key} className="funnel-row">
            <div className="funnel-meta">
              <div className="funnel-title">{row.title}</div>
              <div className="funnel-sub">{row.sub}</div>
            </div>
            <div className="funnel-bar-wrap">
              <div className="funnel-bar" style={{ width: `${Math.max(widthPct, 1)}%` }}>
                <span className="funnel-bar-label">{val.toLocaleString()}</span>
              </div>
            </div>
            <div className="funnel-pct">
              <div>{overallPct}%</div>
              {stepPct != null && <div className="funnel-step">{stepPct}% step</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrendBars({ items }: { items: Array<{ label: string; value: number; prev: number }> }) {
  if (items.length === 0) return <div className="empty">Nothing yet in this window.</div>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="sig-trend">
      {items.map((it) => {
        const d = it.value - it.prev;
        return (
          <div className="sig-trend-row" key={it.label}>
            <span className="sig-trend-label">{it.label}</span>
            <div className="sig-trend-track"><span style={{ width: `${(it.value / max) * 100}%` }} /></div>
            <span className="sig-trend-val">{it.value}</span>
            <span className={`sig-trend-delta ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>
              {d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${Math.abs(d)}` : "–"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
