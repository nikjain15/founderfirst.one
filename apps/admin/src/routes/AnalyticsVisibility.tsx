import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  gsc, getGeoSummary,
  type GscDateRow, type GeoPromptStatus,
} from "../lib/supabase";
import { HBarBreakdown } from "../lib/charts";
import { Takeaway } from "../lib/Takeaway";
import { IconAlert } from "../lib/icons";

const RANGES: Array<{ label: string; days: number }> = [
  { label: "Last 7d",  days: 7  },
  { label: "Last 28d", days: 28 },
  { label: "Last 90d", days: 90 },
];

/**
 * Visibility — how FounderFirst surfaces in search (Google Search Console) and
 * in AI answer engines (GEO citation tracking via the daily geo-probe).
 * Search data is proxied live; GEO data is the stored daily probe history.
 */
export function AnalyticsVisibility() {
  const [rangeIdx, setRangeIdx] = useState(1);
  const days = RANGES[rangeIdx].days;

  // Two independent sources — keep them independent so a GSC 403 (until the
  // service account is granted access) never hides the GEO panel, and vice versa.
  // retry:1 — GSC fails cleanly (403 until the Search Console API is enabled, or
  // empty until Google backfills). One retry covers a cold-start blip; beyond
  // that, surface the helpful error card fast instead of a long spinner.
  const summaryQ = useQuery({ queryKey: ["gsc.summary", days],    queryFn: () => gsc.summary(days),        retry: 1 });
  const byDateQ  = useQuery({ queryKey: ["gsc.byDate", days],     queryFn: () => gsc.byDate(days),         retry: 1 });
  const queriesQ = useQuery({ queryKey: ["gsc.topQueries", days], queryFn: () => gsc.topQueries(days, 10), retry: 1 });
  const pagesQ   = useQuery({ queryKey: ["gsc.topPages", days],   queryFn: () => gsc.topPages(days, 10),   retry: 1 });
  const geoQ     = useQuery({ queryKey: ["geo.summary", days],    queryFn: () => getGeoSummary(days) });

  const gscError = summaryQ.error || byDateQ.error || queriesQ.error || pagesQ.error;
  const summary  = summaryQ.data;
  const geo      = geoQ.data;

  return (
    <>
      <div className="toolbar" style={{ marginTop: 0, marginBottom: 20 }}>
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            className={`chip ${i === rangeIdx ? "active" : ""}`}
            onClick={() => setRangeIdx(i)}
            type="button"
          >
            {r.label}
          </button>
        ))}
        <div className="toolbar-spacer" />
        <span style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-3)" }}>
          Google Search Console · Gemini · Perplexity
        </span>
      </div>

      <VisibilityTakeaway
        clicks={summary?.clicks}
        gscError={!!gscError}
        citedCount={geo?.cited_count}
        promptsTracked={geo?.prompts_tracked}
        geoError={!!geoQ.error}
      />

      {/* ---- Search visibility (GSC) ------------------------------------- */}
      <div className="eyebrow analytics-section-label" style={{ marginTop: 28 }}>Search · Google</div>

      {gscError ? (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't reach Search Console.</p>
          {gscError.message}
          <p style={{ marginTop: 10, fontSize: "var(--fs-eyebrow)" }}>
            Check: (1) <code>gsc-proxy</code> deployed; (2) the <code>GCP_SA_JSON</code> service-account
            email is added as a user on the GSC property (Settings → Users); (3) the Search Console API
            is enabled in that GCP project.
          </p>
        </div>
      ) : summaryQ.isPending ? (
        <div className="empty">Loading from Google Search Console…</div>
      ) : (
        <>
          {summary && (
            <div className="kpi-strip">
              <Kpi label="Clicks"        value={summary.clicks.toLocaleString()} />
              <Kpi label="Impressions"   value={summary.impressions.toLocaleString()} />
              <Kpi label="CTR"           value={`${(summary.ctr * 100).toFixed(1)}%`} />
              <Kpi label="Avg position"  value={summary.position ? summary.position.toFixed(1) : "—"} />
            </div>
          )}

          <section style={{ marginTop: 28 }}>
            <h2 className="section-title">Impressions over time</h2>
            <p className="section-sub">How often FounderFirst appeared in Google results per day.</p>
            <GscSparkline rows={byDateQ.data?.rows ?? []} days={days} />
          </section>

          <div className="analytics-two-col">
            <section>
              <h2 className="section-title">Top queries</h2>
              <p className="section-sub">Searches that surfaced the site, by clicks.</p>
              <HBarBreakdown
                items={(queriesQ.data?.rows ?? []).map((q) => ({
                  key: q.query, label: q.query || "(unknown)",
                  value: q.clicks || q.impressions,
                }))}
              />
            </section>
            <section>
              <h2 className="section-title">Top pages</h2>
              <p className="section-sub">Landing pages from search, by clicks.</p>
              <HBarBreakdown
                items={(pagesQ.data?.rows ?? []).map((p) => ({
                  key: p.page, label: shortPath(p.page),
                  value: p.clicks || p.impressions,
                }))}
              />
            </section>
          </div>
        </>
      )}

      {/* ---- GEO / AI-answer visibility ---------------------------------- */}
      <div className="eyebrow analytics-section-label" style={{ marginTop: 36 }}>AI answers · GEO</div>

      {geoQ.error ? (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load GEO data.</p>
          {geoQ.error.message}
        </div>
      ) : geoQ.isPending ? (
        <div className="empty">Loading citation tracking…</div>
      ) : geo && geo.probes === 0 ? (
        <div className="empty">
          <p className="empty-title">No probes yet.</p>
          <p style={{ marginTop: 6, fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)" }}>
            The daily <code>geo-probe</code> runs at 11:00 UTC. Tracking {geo.prompts_tracked} buyer-intent
            prompts — results appear after the first run (needs <code>GEMINI_API_KEY</code> + the cron secret).
          </p>
        </div>
      ) : geo ? (
        <>
          <div className="kpi-strip">
            <Kpi label="Citation rate"  value={`${Math.round(geo.citation_rate * 100)}%`} sub={`${geo.cited_count}/${geo.prompts_tracked} prompts`} />
            <Kpi label="Cited"          value={geo.cited_count} />
            <Kpi label="Mentioned only" value={geo.mentioned_count} sub="named, not linked" />
            <Kpi label="Prompts"        value={geo.prompts_tracked} />
          </div>

          {geo.engines.length > 0 && (
            <p style={{ marginTop: 10, fontSize: "var(--fs-data-row)", color: "var(--ink-3)" }}>
              By engine:{" "}
              {geo.engines.map((e, i) => (
                <span key={e.engine}>
                  {i > 0 && " · "}
                  <span style={{ textTransform: "capitalize", color: "var(--ink-2)" }}>{e.engine}</span>{" "}
                  {Math.round(e.rate * 100)}% <span style={{ color: "var(--ink-4)" }}>({e.cited}/{e.probes})</span>
                </span>
              ))}
            </p>
          )}

          <section style={{ marginTop: 28 }}>
            <h2 className="section-title">Citation rate over time</h2>
            <p className="section-sub">Share of tracked prompts where an AI answer cited founderfirst.one.</p>
            <GeoRateSparkline rows={geo.trend} days={days} />
          </section>

          <div className="analytics-two-col">
            <section>
              <h2 className="section-title">Buyer-intent prompts</h2>
              <p className="section-sub">Latest AI-answer status per question we track.</p>
              <PromptList prompts={geo.prompts} />
            </section>
            <section>
              <h2 className="section-title">Competitors named</h2>
              <p className="section-sub">Tools the AI answers mentioned instead.</p>
              <HBarBreakdown
                items={geo.competitors.map((c) => ({ key: c.name, label: c.name, value: c.count, tone: "amber" }))}
              />
            </section>
          </div>

          <p style={{ marginTop: 18, fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)" }}>
            For Copilot / ChatGPT coverage, also check{" "}
            <a href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer" style={{ color: "var(--ink-2)" }}>
              Bing Webmaster Tools → AI Performance
            </a>{" "}(free, manual — no API yet).
          </p>
        </>
      ) : null}
    </>
  );
}

function VisibilityTakeaway({
  clicks, gscError, citedCount, promptsTracked, geoError,
}: {
  clicks?: number; gscError: boolean;
  citedCount?: number; promptsTracked?: number; geoError: boolean;
}) {
  const parts: string[] = [];
  if (!gscError && clicks !== undefined) {
    parts.push(clicks > 0 ? `Google sends ${clicks.toLocaleString()} clicks` : "Google sends 0 clicks yet (site is new)");
  }
  if (!geoError && citedCount !== undefined && promptsTracked !== undefined) {
    parts.push(`cited in ${citedCount} of ${promptsTracked} AI buyer-intent answers`);
  }
  if (parts.length === 0) return null;

  const tone = (citedCount ?? 0) > 0 || (clicks ?? 0) > 0 ? "good" : "watch";
  const next = (citedCount ?? 0) === 0
    ? " — publish buyer-intent + comparison content to start earning citations."
    : ".";
  return (
    <Takeaway tone={tone}>
      {parts.join("; ").replace(/^./, (c) => c.toUpperCase())}{next}
    </Takeaway>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="kpi-tile">
      <div className="kpi-tile-label">{label}</div>
      <div className="kpi-tile-value">{value}</div>
      {sub && <div className="kpi-tile-sub">{sub}</div>}
    </div>
  );
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return url;
  }
}

function PromptList({ prompts }: { prompts: GeoPromptStatus[] }) {
  if (prompts.length === 0) return <div className="empty-inline">No prompts tracked.</div>;
  return (
    <div className="hbar-list">
      {prompts.map((p) => {
        const engines = p.engines_cited?.length ? ` · ${p.engines_cited.join(", ")}` : "";
        const status = p.cited
          ? { text: `${p.rank ? `Cited · #${p.rank}` : "Cited"}${engines}`, color: "var(--income)" }
          : p.mentioned
            ? { text: "Mentioned", color: "var(--amber)" }
            : { text: "Absent", color: "var(--ink-4)" };
        return (
          <div key={p.prompt} className="hbar-row" style={{ alignItems: "baseline" }}>
            <div className="hbar-meta">
              <span className="hbar-label">{p.prompt}</span>
              <span className="hbar-value" style={{ color: status.color, whiteSpace: "nowrap" }}>
                {status.text}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GscSparkline({ rows, days }: { rows: GscDateRow[]; days: number }) {
  if (rows.length === 0) return <div className="empty-inline">No search data yet (Google backfills ~48h after verification).</div>;
  const max = Math.max(1, ...rows.map((r) => r.impressions));
  const W = 720, H = 140, P = 10;
  const stepX = rows.length > 1 ? (W - 2 * P) / (rows.length - 1) : 0;
  const points = rows.map((r, i) => {
    const x = P + i * stepX;
    const y = H - P - (r.impressions / max) * (H - 2 * P);
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="sparkline">
        <polyline points={points} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
      </svg>
      <div className="sparkline-axis">
        <span>{fmtMd(rows[0].date)}</span>
        <span style={{ color: "var(--ink-3)" }}>peak {max} impressions · {days}d</span>
        <span>{fmtMd(rows[rows.length - 1].date)}</span>
      </div>
    </div>
  );
}

function GeoRateSparkline({ rows, days }: { rows: { date: string; rate: number }[]; days: number }) {
  if (rows.length === 0) return <div className="empty-inline">No citation history yet.</div>;
  const W = 720, H = 140, P = 10;
  const stepX = rows.length > 1 ? (W - 2 * P) / (rows.length - 1) : 0;
  const points = rows.map((r, i) => {
    const x = P + i * stepX;
    const y = H - P - r.rate * (H - 2 * P); // rate is 0..1
    return `${x},${y}`;
  }).join(" ");
  const peak = Math.round(Math.max(0, ...rows.map((r) => r.rate)) * 100);
  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="sparkline">
        <polyline points={points} fill="none" stroke="var(--income)" strokeWidth={1.5} />
      </svg>
      <div className="sparkline-axis">
        <span>{fmtMd(rows[0].date)}</span>
        <span style={{ color: "var(--ink-3)" }}>peak {peak}% cited · {days}d</span>
        <span>{fmtMd(rows[rows.length - 1].date)}</span>
      </div>
    </div>
  );
}

// GSC / geo_summary return ISO "YYYY-MM-DD".
function fmtMd(iso: string): string {
  return iso.length >= 10 ? iso.slice(5) : iso;
}
