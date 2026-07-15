import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  listContentPipeline,
  getContentPipelineItem,
  setContentPipelineStatus,
  getActiveVoiceProfile,
  draftContentItem,
  generateContentAudio,
  publishContentItem,
  type ContentPipelineRow,
  type ContentStatus,
} from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";
import { ContentSubnav } from "./ContentSubnav";

/**
 * Penny → Content pipeline — the board where content ideas become published
 * posts + audio. Insights routes content-surface findings in here as 'ideas';
 * this screen is the human-in-the-loop: review each item and move it along the
 * flow (idea → drafting → review → published, or dismiss). The auto draft/audio
 * steps (Claude + Chatterbox) fill draft_md / audio_url at the 'drafting' stage;
 * until those land this is a working tracker that shows what's grounded and lets
 * you stage items by hand.
 */
const STAGES: ContentStatus[] = ["idea", "drafting", "review", "published"];
const STATUS_LABEL: Record<ContentStatus, string> = {
  idea: "Idea", drafting: "Drafting", review: "Review", published: "Published", dismissed: "Dismissed",
};
const STATUS_BADGE: Record<ContentStatus, string> = {
  idea: "badge-draft", drafting: "badge-draft", review: "badge-warn",
  published: "badge-live", dismissed: "badge-warn",
};
/** Where each stage can move next (the buttons we show on the detail panel). */
const NEXT: Record<ContentStatus, ContentStatus[]> = {
  idea: ["drafting", "dismissed"],
  drafting: ["review", "idea", "dismissed"],
  review: ["published", "drafting", "dismissed"],
  published: ["review"],
  dismissed: ["idea"],
};

type Grounding = { observation?: string; surface?: string; theme?: string; evidence?: Array<{ metric: string; value: unknown }> };

export function ContentPipeline() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const { data: items = [], isPending: loading, error: qErr } = useQuery({
    queryKey: ["contentPipeline"],
    queryFn: () => listContentPipeline(),
  });

  // Async audio render — Kokoro renders on Fly (~minutes); we poll until audio_url lands.
  const [renderingItemId, setRenderingItemId] = useState<string | null>(null);
  const [renderStartMs, setRenderStartMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const activeId = selectedId ?? items[0]?.id ?? null;
  const { data: detail } = useQuery({
    queryKey: ["contentPipelineItem", activeId],
    queryFn: () => (activeId ? getContentPipelineItem(activeId) : Promise.resolve(null)),
    enabled: !!activeId,
    // While an item is rendering audio, poll so the player appears the moment it's ready.
    refetchInterval: renderingItemId ? 8000 : false,
  });

  // Tick the elapsed clock once a second while rendering.
  useEffect(() => {
    if (!renderingItemId) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [renderingItemId]);

  // Clear the rendering state once the audio lands for that item.
  useEffect(() => {
    if (renderingItemId && detail?.id === renderingItemId && detail?.audio_url) {
      setRenderingItemId(null);
      setRenderStartMs(null);
      setFlash("Audio is ready — in Penny's voice.");
      void qc.invalidateQueries({ queryKey: ["contentPipeline"] });
    }
  }, [renderingItemId, detail?.id, detail?.audio_url, qc]);

  // Rough ETA from the script length (Kokoro on CPU ≈ a few seconds per line + warmup).
  const scriptLines = Array.isArray((detail?.script as { audio?: unknown[] } | null)?.audio)
    ? ((detail!.script as { audio: unknown[] }).audio.length) : 0;
  const etaSec = Math.max(60, 40 + scriptLines * 14);
  const elapsedSec = renderStartMs ? Math.floor((nowMs - renderStartMs) / 1000) : 0;
  const isRendering = renderingItemId === detail?.id;

  // Brand voice readiness — audio steps are blocked until a reference clip exists.
  const { data: voice } = useQuery({ queryKey: ["activeVoiceProfile"], queryFn: getActiveVoiceProfile });
  // Kokoro needs no reference clip; only the legacy clone path requires one.
  const voiceReady = (voice?.engine ?? "kokoro") === "kokoro" || !!voice?.reference_clip_url;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["contentPipelineItem", activeId] });
    void qc.invalidateQueries({ queryKey: ["contentPipeline"] });
  };

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) => setContentPipelineStatus(id, status),
    onSuccess: async (_d, vars) => { setFlash(`Moved to ${STATUS_LABEL[vars.status]}.`); await refresh(); },
    onError: (e) => setError((e as Error).message),
  });

  const draftMut = useMutation({
    mutationFn: (id: string) => draftContentItem(id),
    onSuccess: async (r) => { setError(null); setFlash(`Drafted with ${r.model ?? "Claude"}.`); await refresh(); },
    onError: (e) => setError((e as Error).message),
  });

  const audioMut = useMutation({
    mutationFn: (id: string) => generateContentAudio(id),
    onSuccess: async (r, id) => {
      setError(null);
      if (r.status === "rendering") {
        setRenderingItemId(id);
        setRenderStartMs(Date.now());
        setFlash("Rendering audio in Penny's voice — this takes a few minutes.");
      } else {
        setFlash(`Audio rendered via ${r.provider ?? "TTS"}.`);
      }
      await refresh();
    },
    onError: (e) => setError((e as Error).message),
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => publishContentItem(id),
    onSuccess: async (r) => { setError(null); setFlash(`Published → ${r.blog_path ?? "blog"}.`); await refresh(); },
    onError: (e) => setError((e as Error).message),
  });

  const busy = draftMut.isPending || audioMut.isPending || publishMut.isPending || statusMut.isPending;

  // Group the list by stage so the board reads as a flow (dismissed shown last).
  const grouped = useMemo(() => {
    const buckets: Array<{ status: ContentStatus; items: ContentPipelineRow[] }> = [];
    for (const s of [...STAGES, "dismissed" as ContentStatus]) {
      const rows = items.filter((i) => i.status === s);
      if (rows.length) buckets.push({ status: s, items: rows });
    }
    return buckets;
  }, [items]);

  const grounding = (detail?.grounding ?? {}) as Grounding;
  const displayError = error ?? (qErr ? (qErr as Error).message : null);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div className="eyebrow">Admin · penny</div>
        <h1 className="page-title">Content pipeline.</h1>
        <p className="page-sub" style={{ margin: 0 }}>
          Ideas from Insights become published posts + audio. Review each item and move it along the flow.
        </p>
      </div>

      <ContentSubnav active="pipeline" />

      {!voiceReady && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          <IconAlert size={16} />
          <span>Brand voice not set up yet — audio output is blocked until a reference clip is added to the voice profile.</span>
        </div>
      )}
      {displayError && <div className="alert alert-error" style={{ marginBottom: 12 }}><IconAlert size={16} /> <span>{displayError}</span></div>}
      {flash && <div className="alert alert-success" style={{ marginBottom: 12 }}><IconCheck size={16} /> <span>{flash}</span></div>}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty">No content yet. Route an idea in from Analytics → Insights (the “Send to pipeline” button).</div>
      ) : (
        <div className="prompt-editor prompt-editor-grid">
          <aside>
            {grouped.map((bucket) => (
              <div key={bucket.status} style={{ marginBottom: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                  <span>{STATUS_LABEL[bucket.status]}</span>
                  <span style={{ color: "var(--ink-3)" }}>{bucket.items.length}</span>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {bucket.items.map((i) => {
                    const isSel = i.id === activeId;
                    return (
                      <li key={i.id}>
                        <button
                          onClick={() => { setSelectedId(i.id); setError(null); setFlash(null); }}
                          className={`version-row ${isSel ? "active" : ""}`}
                          style={{
                            width: "100%", textAlign: "left", padding: "10px 12px",
                            border: "1px solid", borderColor: isSel ? "var(--ink)" : "var(--line)",
                            background: isSel ? "var(--paper)" : "transparent", borderRadius: 8,
                            cursor: "pointer", fontSize: "var(--fs-data-row)",
                          }}
                        >
                          <strong style={{ display: "block" }}>{i.topic}</strong>
                          <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span>{i.source}</span>
                            <span>· {new Date(i.updated_at).toLocaleDateString()}</span>
                            {i.has_audio && <span>· 🔊 audio</span>}
                            {i.published_ref && <span>· published</span>}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </aside>

          <section>
            {!detail ? (
              <div className="empty">Select an item.</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", marginBottom: 10 }}>
                  <h2 style={{ margin: 0, fontSize: "var(--fs-h2, 1.1rem)" }}>{detail.topic}</h2>
                  <span className={`badge ${STATUS_BADGE[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
                </div>

                {detail.angle && <p className="page-sub" style={{ marginTop: 0 }}>{detail.angle}</p>}

                {grounding.observation && (
                  <p style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-2)" }}>{grounding.observation}</p>
                )}

                {Array.isArray(grounding.evidence) && grounding.evidence.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {grounding.evidence.slice(0, 6).map((e, idx) => (
                      <span key={idx} className="ins-evidence" title="Grounded in this real metric">
                        {e.metric}: <strong>{String(e.value)}</strong>
                      </span>
                    ))}
                  </div>
                )}

                {detail.draft_md ? (
                  <div style={{ margin: "12px 0" }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Draft</div>
                    <div style={{ whiteSpace: "pre-wrap", fontSize: "var(--fs-data-row)", color: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px" }}>{detail.draft_md}</div>
                  </div>
                ) : (
                  <p style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)" }}>
                    No draft yet — auto-draft (Claude) runs at the Drafting stage.
                  </p>
                )}

                {isRendering && (
                  <div style={{ margin: "12px 0", border: "1px solid var(--brand)", background: "var(--brand-tint)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-data-row)", fontWeight: "var(--fw-semibold)" }}>
                      <span className="spin" style={{ width: 14, height: 14, border: "2px solid var(--brand)", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "ffspin 0.8s linear infinite" }} />
                      Rendering audio in Penny's voice…
                    </div>
                    <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 6 }}>
                      {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")} elapsed · about {Math.ceil(etaSec / 60)} min total. You can leave this page — it keeps rendering.
                    </div>
                    <div style={{ height: 6, background: "var(--white)", borderRadius: 999, overflow: "hidden", marginTop: 8 }}>
                      <div style={{ height: "100%", width: `${Math.min(95, Math.round((elapsedSec / etaSec) * 100))}%`, background: "var(--brand)", transition: "width 1s linear" }} />
                    </div>
                    <style>{`@keyframes ffspin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                )}

                {detail.audio_url && !isRendering && (
                  <div style={{ margin: "12px 0" }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Audio{detail.audio_seconds ? ` · ${Math.floor(detail.audio_seconds / 60)}:${String(detail.audio_seconds % 60).padStart(2, "0")}` : ""}</div>
                    <audio controls src={detail.audio_url} style={{ width: "100%" }} />
                  </div>
                )}

                {detail.published_ref && (
                  <p style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)" }}>Published → {detail.published_ref}</p>
                )}

                {/* Auto steps — the production line (Claude draft → TTS audio → publish). */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
                  {(detail.status === "idea" || detail.status === "drafting") && (
                    <button className="btn primary" disabled={busy} onClick={() => draftMut.mutate(detail.id)}>
                      {draftMut.isPending ? "Drafting…" : detail.draft_md ? "Re-draft with Claude" : "Draft with Claude"}
                    </button>
                  )}
                  {detail.draft_md && (
                    <button
                      className="btn"
                      disabled={busy || !voiceReady || isRendering}
                      title={voiceReady ? "" : "Add a brand voice reference clip first"}
                      onClick={() => audioMut.mutate(detail.id)}
                    >
                      {isRendering || audioMut.isPending ? "Rendering…" : detail.audio_url ? "Re-render audio" : "Generate audio"}
                    </button>
                  )}
                  {detail.status === "review" && (
                    <button className="btn primary" disabled={busy} onClick={() => publishMut.mutate(detail.id)}>
                      {publishMut.isPending ? "Publishing…" : "Publish to blog"}
                    </button>
                  )}
                </div>

                {/* Manual stage moves. */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {NEXT[detail.status].map((s) => (
                    <button
                      key={s}
                      className="btn"
                      disabled={busy}
                      onClick={() => statusMut.mutate({ id: detail.id, status: s })}
                    >
                      {s === "dismissed" ? "Dismiss" : `→ ${STATUS_LABEL[s]}`}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
