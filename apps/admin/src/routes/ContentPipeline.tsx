import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { marked } from "marked";
import {
  listContentPipeline,
  getContentPipelineItem,
  setContentPipelineStatus,
  createContentPipelineItem,
  type ContentPipelineSummary,
  type ContentStatus,
} from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";

marked.setOptions({ gfm: true, breaks: false });

/**
 * Penny → Pipeline — the content production board.
 *
 * Ideas land here from Analytics → Insights ("Send to pipeline") or manual
 * entry, then move idea → drafting → review → published. Drafting and publishing
 * are automated by later steps (content-draft / content-publish fns); this board
 * is the human review surface + manual stage control. No upload UI by design.
 */
const STATUSES: ContentStatus[] = ["idea", "drafting", "review", "published", "dismissed"];
const STATUS_LABEL: Record<ContentStatus, string> = {
  idea: "Idea", drafting: "Drafting", review: "Review", published: "Published", dismissed: "Dismissed",
};
const STATUS_BADGE: Record<ContentStatus, string> = {
  idea: "badge-draft", drafting: "badge-draft", review: "badge-warn", published: "badge-live", dismissed: "badge-warn",
};

// Sanitized markdown → HTML (same inert-DOMParser approach as ContentPrompt).
function renderMarkdown(md: string): string {
  const html = marked.parse(md) as string;
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;
  root.querySelectorAll("script, style, iframe, object, embed, link, meta, base, form").forEach((el) => el.remove());
  return root.innerHTML;
}

export function ContentPipeline() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ContentStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [newAngle, setNewAngle] = useState("");

  const { data: items = [], isPending: loading, error: qErr } = useQuery({
    queryKey: ["contentPipeline"],
    queryFn: () => listContentPipeline(),
  });

  const shown = filter === "all" ? items : items.filter((i) => i.status === filter);
  const activeId = selectedId && shown.some((i) => i.id === selectedId) ? selectedId : shown[0]?.id ?? null;

  const { data: detail } = useQuery({
    queryKey: ["contentPipelineItem", activeId],
    queryFn: () => (activeId ? getContentPipelineItem(activeId) : Promise.resolve(null)),
    enabled: !!activeId,
  });

  const refresh = async (id?: string) => {
    await qc.invalidateQueries({ queryKey: ["contentPipeline"] });
    if (id) void qc.invalidateQueries({ queryKey: ["contentPipelineItem", id] });
  };

  const addMut = useMutation({
    mutationFn: () => createContentPipelineItem({ source: "manual", topic: newTopic.trim(), angle: newAngle.trim() || null }),
    onSuccess: async (id) => {
      setError(null); setFlash("Idea added to the pipeline.");
      setNewTopic(""); setNewAngle(""); setAdding(false);
      await refresh(); setSelectedId(id);
    },
    onError: (e) => { setFlash(null); setError((e as Error).message); },
  });

  const stageMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) => setContentPipelineStatus(id, status),
    onSuccess: async (_r, v) => { setError(null); await refresh(v.id); },
    onError: (e) => setError((e as Error).message),
  });

  const displayError = error ?? (qErr ? (qErr as Error).message : null);
  const counts = (s: ContentStatus) => items.filter((i) => i.status === s).length;

  return (
    <div>
      <div className="eyebrow">Content pipeline · idea → review → published</div>
      <p className="page-sub" style={{ margin: "0 0 16px" }}>
        Ideas from Insights or added by hand. Drafting and publishing run automatically — you review and approve.
      </p>

      {/* ---- Toolbar: stage filters + new idea ------------------------------- */}
      <div className="ins-config-row ins-config-gen" style={{ marginBottom: 12 }}>
        <div className="ins-chips">
          <button type="button" className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
            All <span style={{ opacity: 0.6 }}>{items.length}</span>
          </button>
          {STATUSES.map((s) => (
            <button key={s} type="button" className={`chip ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
              {STATUS_LABEL[s]} <span style={{ opacity: 0.6 }}>{counts(s)}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-spacer" />
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ New idea"}</button>
      </div>

      {adding && (
        <div className="ins-card" style={{ marginBottom: 12, display: "grid", gap: 8 }}>
          <div className="field">
            <input placeholder="Topic (what's the piece about?)" value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)} />
          </div>
          <div className="field">
            <input placeholder="Angle (optional — the take / hook)" value={newAngle}
              onChange={(e) => setNewAngle(e.target.value)} />
          </div>
          <div>
            <button className="btn primary" disabled={!newTopic.trim() || addMut.isPending}
              onClick={() => addMut.mutate()}>
              {addMut.isPending ? "Adding…" : "Add idea"}
            </button>
          </div>
        </div>
      )}

      {displayError && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          <IconAlert size={16} /> <span>{displayError}</span>
        </div>
      )}
      {flash && (
        <div className="alert alert-success" style={{ marginBottom: 12 }}>
          <IconCheck size={16} /> <span>{flash}</span>
        </div>
      )}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty">No content yet. Send an idea from Analytics → Insights, or click “+ New idea”.</div>
      ) : (
        <div className="prompt-editor prompt-editor-grid">
          <aside>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{shown.length} item(s)</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {shown.map((it: ContentPipelineSummary) => {
                const isSel = it.id === activeId;
                return (
                  <li key={it.id}>
                    <button onClick={() => setSelectedId(it.id)}
                      className={`version-row ${isSel ? "active" : ""}`}
                      style={{
                        width: "100%", textAlign: "left", padding: "10px 12px",
                        border: "1px solid", borderColor: isSel ? "var(--ink)" : "var(--line)",
                        background: isSel ? "var(--paper)" : "transparent", borderRadius: 8,
                        cursor: "pointer", fontSize: "var(--fs-data-row)",
                      }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.topic}</strong>
                        <span className={`badge ${STATUS_BADGE[it.status]}`}>{STATUS_LABEL[it.status]}</span>
                      </div>
                      <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 3 }}>
                        {it.source}{it.has_audio ? " · 🔊 audio" : ""} · {new Date(it.updated_at).toLocaleDateString()}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section>
            {detail && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", marginBottom: 6 }}>
                  <h2 className="page-title" style={{ fontSize: "var(--fs-h2)", margin: 0 }}>{detail.topic}</h2>
                  <span className={`badge ${STATUS_BADGE[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
                </div>
                {detail.angle && <p className="ins-card-obs" style={{ marginTop: 0 }}>{detail.angle}</p>}
                <div className="ins-badges" style={{ marginBottom: 14 }}>
                  <span className="badge badge-draft">{detail.source}</span>
                  {detail.published_ref && <span className="ins-evidence">published: <strong>{detail.published_ref}</strong></span>}
                </div>

                {/* Stage controls */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {STATUSES.filter((s) => s !== detail.status).map((s) => (
                    <button key={s}
                      className={`btn ${s === "published" ? "primary" : ""}`}
                      disabled={stageMut.isPending}
                      onClick={() => stageMut.mutate({ id: detail.id, status: s })}>
                      Move to {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>

                {/* Draft */}
                <div className="eyebrow" style={{ marginBottom: 6 }}>Draft</div>
                {detail.draft_md ? (
                  <div className="voice-rendered" dangerouslySetInnerHTML={{ __html: renderMarkdown(detail.draft_md) }} />
                ) : (
                  <div className="empty" style={{ marginBottom: 16 }}>
                    No draft yet — drafting runs automatically once wired (Step 5).
                  </div>
                )}

                {/* Audio */}
                {detail.audio_url && (
                  <>
                    <div className="eyebrow" style={{ margin: "16px 0 6px" }}>Audio</div>
                    <audio controls src={detail.audio_url} style={{ width: "100%" }} />
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
