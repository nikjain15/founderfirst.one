import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ContentPrompt } from "./ContentPrompt";
import { ContentVoice } from "./ContentVoice";
import { ContentPipeline } from "./ContentPipeline";
import { ContentSubnav } from "./ContentSubnav";
import {
  getClient,
  listPrompts,
  listVoice,
  type PromptRow,
  type VoiceRow,
} from "../lib/supabase";

// "kb" (knowledge base) is intentionally omitted from the nav until the
// Phase 2 vector-search feature ships — the panel was a dead placeholder.
// Site copy + the blog live on their own routes (see ContentSubnav).
type Tab = "prompt" | "voice" | "pipeline";

export function ContentHome() {
  const location = useLocation();
  const navigate = useNavigate();
  const hash = location.hash.slice(1);
  const tab: Tab = hash === "voice" ? "voice" : hash === "pipeline" ? "pipeline" : "prompt";

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · penny</div>
      <h1 className="page-title">Penny.</h1>
      <p className="page-sub">Penny's brain, the site copy, and the blog — everything Penny knows and says, in one place.</p>

      <ActivityStrip onJumpTab={(t) => navigate(`/content#${t}`)} />

      <ContentSubnav active={tab} />

      <div className="tab-panel" role="tabpanel" id="content-tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "prompt"   && <ContentPrompt />}
        {tab === "voice"    && <ContentVoice />}
        {tab === "pipeline" && <ContentPipeline />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Activity strip
 *
 * Merges recent rows from penny_prompts + penny_voice into one
 * chronological feed so an admin sees what changed across Penny's
 * brain since they last looked. "Unseen" is tracked per-admin in
 * localStorage by max-timestamp — each visit marks everything-as-read.
 * No new backend infra — pure read of data we already have.
 * ---------------------------------------------------------------- */

type ActivityItem = {
  kind: "prompt" | "voice";
  version: number;
  author: string | null;
  whenISO: string;
  isLive: boolean;
};

const SEEN_KEY = "ff.admin.brain.lastSeenAt";

function ActivityStrip({ onJumpTab }: { onJumpTab: (t: Tab) => void }) {
  const [lastSeenAt, setLastSeenAt] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(SEEN_KEY) ?? "";
  });

  // Who am I — used to dim my own changes in the "since you last looked" count.
  const { data: myEmail = null } = useQuery({
    queryKey: ["myEmail"],
    queryFn: async () =>
      (await getClient().auth.getUser()).data.user?.email?.toLowerCase() ?? null,
  });

  // Reuse the ["prompts"] / ["voice"] caches so the strip refreshes the instant
  // ContentPrompt / ContentVoice publish a new version.
  const { data: prompts = [], isPending: promptsPending } = useQuery({ queryKey: ["prompts"], queryFn: listPrompts });
  const { data: voice = [], isPending: voicePending } = useQuery({ queryKey: ["voice"], queryFn: listVoice });
  const loading = promptsPending || voicePending;

  // Merge both feeds into one chronological list, newest first, capped at 5.
  const items = useMemo<ActivityItem[] | null>(() => {
    if (loading) return null;
    return [
      ...prompts.slice(0, 8).map((r: PromptRow) => ({
        kind: "prompt" as const,
        version: r.version,
        author: r.created_by_email,
        whenISO: r.created_at,
        isLive: r.is_live,
      })),
      ...voice.slice(0, 8).map((r: VoiceRow) => ({
        kind: "voice" as const,
        version: r.version,
        author: r.created_by_email,
        whenISO: r.created_at,
        isLive: r.is_live,
      })),
    ].sort((a, b) => (a.whenISO < b.whenISO ? 1 : -1)).slice(0, 5);
  }, [prompts, voice, loading]);

  const unseenFromOthers = useMemo(() => {
    if (!items) return [];
    return items.filter((it) => {
      const fromOther = !!it.author && (!myEmail || it.author.toLowerCase() !== myEmail);
      const isNew = !lastSeenAt || it.whenISO > lastSeenAt;
      return fromOther && isNew;
    });
  }, [items, lastSeenAt, myEmail]);

  function markAllSeen() {
    if (!items?.length) return;
    const latest = items[0].whenISO;
    window.localStorage.setItem(SEEN_KEY, latest);
    setLastSeenAt(latest);
  }

  if (!items || items.length === 0) return null;

  const headline = unseenFromOthers[0] ?? items[0];
  const unseenCount = unseenFromOthers.length;
  const showAsNew = unseenCount > 0;

  return (
    <div className={`brain-activity ${showAsNew ? "is-new" : ""}`}>
      <div className="brain-activity-headline">
        <span className={`brain-activity-dot ${showAsNew ? "is-new" : ""}`} aria-hidden />
        <span className="brain-activity-text">
          {showAsNew ? (
            <>
              <strong>{unseenCount === 1 ? "1 change" : `${unseenCount} changes`} since you last looked.</strong>{" "}
              Latest: <strong>{kindLabel(headline.kind)} v{headline.version}</strong>
              {headline.author ? <> by <strong>{headline.author}</strong></> : null}{" "}
              {fmtRelative(headline.whenISO)}
              {headline.isLive ? <> · <span className="badge badge-live" style={{ marginLeft: 4 }}>Live</span></> : null}
            </>
          ) : (
            <>
              No new activity. Latest: <strong>{kindLabel(headline.kind)} v{headline.version}</strong>
              {headline.author ? <> by <strong>{headline.author}</strong></> : null}{" "}
              {fmtRelative(headline.whenISO)}
            </>
          )}
        </span>
        <div className="brain-activity-actions">
          <button
            className="btn-link"
            onClick={() => onJumpTab(headline.kind === "voice" ? "voice" : "prompt")}
          >
            Review →
          </button>
          {showAsNew && (
            <button className="btn-link btn-link-muted" onClick={markAllSeen}>
              Mark seen
            </button>
          )}
        </div>
      </div>
      {items.length > 1 && (
        <details className="brain-activity-more">
          <summary>See {items.length - 1} more</summary>
          <ul>
            {items.slice(1).map((it, i) => {
              const fromOther = !!it.author && (!myEmail || it.author.toLowerCase() !== myEmail);
              const isNew = !lastSeenAt || it.whenISO > lastSeenAt;
              const isUnseen = fromOther && isNew;
              return (
                <li key={i}>
                  {isUnseen && <span className="brain-activity-dot is-new" aria-hidden />}
                  <span>
                    <strong>{kindLabel(it.kind)} v{it.version}</strong>
                    {it.author ? <> by {it.author}</> : null}{" "}
                    {fmtRelative(it.whenISO)}
                    {it.isLive && <> · <span style={{ color: "var(--income)" }}>live</span></>}
                  </span>
                  <button
                    className="btn-link"
                    onClick={() => onJumpTab(it.kind === "voice" ? "voice" : "prompt")}
                  >
                    Open
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

function kindLabel(k: "prompt" | "voice") {
  return k === "voice" ? "Voice" : "Prompt";
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
