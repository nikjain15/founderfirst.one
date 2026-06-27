/**
 * How it works — an in-app guide to the admin. The guide sections are static
 * (data-driven from GUIDE so copy stays easy to edit); the "What's new" section
 * at the top is live (DB-backed changelog). Anchors (`id`) let the contents rail
 * deep-link within the page.
 */
import { WhatsNew } from "./WhatsNew";

interface Feature {
  name: string;
  desc: string;
}
interface Section {
  id: string;
  tab: string; // eyebrow-style label (where to find it)
  title: string;
  lede: string;
  features: Feature[];
}

const GUIDE: Section[] = [
  {
    id: "support",
    tab: "Support",
    title: "Support inbox",
    lede: "Tickets the Penny bot couldn’t close on its own. Most urgent at the top.",
    features: [
      { name: "Health strip", desc: "Open count, Stale (>24h, flagged amber), Avg first reply, and Resolved over the last 7 days." },
      { name: "Filters", desc: "Narrow by status (open · in progress · resolved · all) and by topic." },
      { name: "Priority & SLA", desc: "Each ticket carries a P1/P2/P3 pill and a Fresh / Aging / Stale SLA badge; the list sorts by urgency." },
      { name: "Reply & resolve", desc: "Open a ticket to see the full user ↔ Penny ↔ admin thread, change its topic, read any 👍/👎 rating, then reply. Tick “Mark resolved” to close as you send — the user gets your reply in their original channel (web or Discord)." },
    ],
  },
  {
    id: "audience",
    tab: "Audience",
    title: "Audience",
    lede: "Everyone who showed up — across three sub-tabs.",
    features: [
      { name: "Web signups", desc: "Your waitlist. Search, sort by newest / email / source, and Export CSV. Click a row for every captured field." },
      { name: "Discord", desc: "People who linked Discord to their FounderFirst email. Search by email/username/ID, see link status, and Revoke a link (the bot loses access on their next message)." },
      { name: "Signals", desc: "Social-listening and outreach pipeline — see the Signals section below." },
    ],
  },
  {
    id: "signals",
    tab: "Audience › Signals",
    title: "Signals — listening & outreach",
    lede: "Sources pull posts → posts are scored → high-intent ones become Leads with a draft to review.",
    features: [
      { name: "Sources", desc: "Set up automated searches per platform (Reddit, X, LinkedIn, Facebook, YouTube) with a query and a poll frequency (15m–24h). Toggle Active/Off and see how many posts each has found." },
      { name: "Posts", desc: "Everything captured, filterable by pending · scored · promoted · archived, each with an intent score and pain tags. You can also paste a post in manually with “+ Add post”." },
      { name: "Leads", desc: "High-intent posts worth contacting. Open one to read the original, edit the auto-drafted outreach, Save, Copy it to paste on-platform, Mark sent, and move it through the stages (new → reviewing → drafted → sent → replied → won / dead)." },
      { name: "Scoring", desc: "The controls that decide what becomes a lead: minimum intent, minimum relevance, a discard floor, keep-list keywords, and relevance (ICP) examples. Changes apply to new posts within ~1 minute." },
    ],
  },
  {
    id: "analytics",
    tab: "Analytics",
    title: "Analytics",
    lede: "The numbers that matter — four sub-tabs.",
    features: [
      { name: "Acquisition", desc: "Where people come from: waitlist signups (trend, top sources, referral leaderboard) plus GA4 traffic — users, sessions, page views, top pages and sources." },
      { name: "Product", desc: "How they use it: the activation funnel (Visited → Opened Penny → Sent a message → Joined waitlist → Came back), PostHog usage, and the AI Insights learning loop. Consented visitors only." },
      { name: "Support", desc: "Support performance: open/stale, avg first reply, resolved, opened-vs-resolved, ticket mix by topic/channel/priority, and CSAT." },
      { name: "Signals", desc: "Social-listening funnel — ingested → scored → promoted → sent → replied → won — with reply/win rates, market themes, and platform breakdown." },
    ],
  },
  {
    id: "content",
    tab: "Penny",
    title: "Penny",
    lede: "Everything Penny knows and says — the brain, the site copy, and the blog — in one place, across four sub-tabs.",
    features: [
      { name: "Prompt", desc: "Penny’s system prompt, version-controlled. Edit, Save as new version, then Set live to publish. Locked guardrails are always applied and can’t be edited." },
      { name: "Voice", desc: "The tone-of-voice guide in plain Markdown with a live preview. Same flow — edit, save a version, set live. Changes reach every surface (site bubble, support bot, in-product) within ~60 seconds; no redeploy." },
      { name: "Site copy", desc: "The published copy of every marketing page — versioned and audited. Change it once here and the site rebuilds; matching emails reflect it too." },
      { name: "Blog", desc: "Write, version, and publish blog posts. The live version renders on the site." },
    ],
  },
  {
    id: "settings",
    tab: "⚙️ Settings",
    title: "Settings",
    lede: "In the gear menu, top-right.",
    features: [
      { name: "Emails", desc: "Edit transactional + recurring email copy, manage their schedules, and review the send/open/click log." },
      { name: "Quality", desc: "The weekly automated audit — health scores across every dimension with a 26-week trend." },
      { name: "Admins", desc: "Who can sign in. Super-admins can invite new admins by email and remove existing ones; everyone else sees the list read-only." },
      { name: "Audit log", desc: "Every admin action recorded — replies, topic changes, sign-ins, Discord revokes, admin changes. Filter by action, person, and time range; click a row for the full payload." },
      { name: "How it works", desc: "This guide, plus the What’s-new changelog." },
    ],
  },
];

export function HowItWorks({ currentEmail }: { currentEmail: string }) {
  return (
    <div className="docs">
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · guide</div>
      <h1 className="page-title">How it works.</h1>
      <p className="page-sub">
        A tour of the admin — what each tab does and the actions you can take. Sign in
        at <code>founderfirst.one/admin</code> with a magic link sent to your inbox; your
        email must be on the admin list.
      </p>

      <nav className="docs-toc" aria-label="Sections">
        <a href="#whats-new" className="docs-toc-link">What&rsquo;s new</a>
        {GUIDE.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="docs-toc-link">{s.title}</a>
        ))}
      </nav>

      <WhatsNew currentEmail={currentEmail} />

      {GUIDE.map((s) => (
        <section key={s.id} id={s.id} className="docs-section">
          <div className="docs-section-head">
            <span className="eyebrow">{s.tab}</span>
            <h2 className="docs-section-title">{s.title}</h2>
            <p className="docs-section-lede">{s.lede}</p>
          </div>
          <dl className="docs-features">
            {s.features.map((f) => (
              <div key={f.name} className="docs-feature">
                <dt>{f.name}</dt>
                <dd>{f.desc}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
