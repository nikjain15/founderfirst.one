/**
 * PostHog tab — product analytics (events, funnels, heatmaps, session replay,
 * time-on-section). Capture runs live on the site after consent; this surfaces
 * it in admin by embedding a PostHog **shared dashboard** (no read key needed —
 * the share token is in the URL). Configure the URL once:
 *
 *   VITE_POSTHOG_DASHBOARD_URL = the "Share → Embed" URL from a PostHog dashboard
 *
 * (PostHog project 394556 · US Cloud). For a deeper native integration later,
 * swap the iframe for a `posthog-proxy` edge function + HogQL queries.
 */
const DASH = import.meta.env.VITE_POSTHOG_DASHBOARD_URL as string | undefined;
const PROJECT_URL = "https://us.posthog.com/project/394556";

export function AnalyticsPostHog() {
  if (DASH) {
    return (
      <div>
        <div className="ph-bar">
          <span className="muted">Product analytics — live capture via PostHog.</span>
          <a className="link" href={PROJECT_URL} target="_blank" rel="noopener noreferrer">Open in PostHog ↗</a>
        </div>
        <iframe
          title="PostHog dashboard"
          src={DASH}
          style={{ width: "100%", height: "70vh", border: "1px solid var(--line)", borderRadius: "var(--r-card)", background: "var(--white)" }}
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="ph-setup">
      <h2 className="card-title">PostHog isn't surfaced here yet</h2>
      <p className="muted">
        Capture is already live — PostHog records pageviews, autocapture, heatmaps and
        session replay on founderfirst.one after cookie consent. To show it here, embed a
        PostHog dashboard:
      </p>
      <ol className="ph-steps">
        <li>In PostHog (project <code>394556</code>), open or create a Dashboard.</li>
        <li>Click <b>Share → Embed</b> and copy the iframe <code>src</code> URL.</li>
        <li>Set <code>VITE_POSTHOG_DASHBOARD_URL</code> in the Pages build env and redeploy.</li>
      </ol>
      <p className="muted">
        For a deeper native integration (custom funnels/time-on-section as cards), create a
        PostHog <b>Personal API key</b> (read scope) and we'll wire a server-side
        <code>posthog-proxy</code> — mirroring the GA4 setup.
      </p>
      <a className="btn" href={PROJECT_URL} target="_blank" rel="noopener noreferrer">Open PostHog ↗</a>
    </div>
  );
}
