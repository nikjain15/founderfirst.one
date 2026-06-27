import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  listBlogPosts,
  listBlogPostVersions,
  createBlogPostVersion,
  setLiveBlogPost,
  type BlogSummaryRow,
} from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";

/**
 * Blog posts editor — same shape as the voice/page editors. Posts are stored as
 * a versioned JSON document (the full BlogPost: title, description, date,
 * readMins, tag, takeaways[], body[] blocks). The body is edited as JSON so the
 * full block vocabulary (prose, stats, quotes, callouts, visuals) stays
 * available; save creates a new version, then "Set live" publishes it. The Astro
 * blog reads the live versions at build.
 */
const STARTER = {
  slug: "new-post",
  title: "New post title",
  description: "One-sentence summary for cards + SEO.",
  date: new Date().toISOString().slice(0, 10),
  readMins: 4,
  tag: "Guides",
  takeaways: ["First key takeaway."],
  body: [{ p: "Opening paragraph." }, { h: "A section heading" }, { p: "More prose." }],
};

export function BlogPosts() {
  const qc = useQueryClient();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const { data: posts = [], isPending: loadingPosts, error: postsErr } = useQuery({
    queryKey: ["blogPosts"],
    queryFn: listBlogPosts,
  });

  const activeSlug = selectedSlug ?? posts[0]?.slug ?? null;
  const { data: versions = [] } = useQuery({
    queryKey: ["blogPostVersions", activeSlug],
    queryFn: () => (activeSlug ? listBlogPostVersions(activeSlug) : Promise.resolve([])),
    enabled: !!activeSlug && !creating,
  });

  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedVersionId) ?? versions.find((v) => v.is_live) ?? versions[0] ?? null,
    [versions, selectedVersionId],
  );

  // Seed the draft from the selected version (one-shot per selection).
  const [seedKey, setSeedKey] = useState<string>("");
  const currentKey = creating ? "creating" : (selectedVersion?.id ?? activeSlug ?? "");
  if (currentKey && currentKey !== seedKey && !editing) {
    setSeedKey(currentKey);
    if (creating) setDraft(JSON.stringify(STARTER, null, 2));
    else if (selectedVersion) setDraft(JSON.stringify(selectedVersion.payload, null, 2));
  }

  function pickPost(slug: string) {
    if (editing && !window.confirm("Discard unsaved changes?")) return;
    setCreating(false);
    setSelectedSlug(slug);
    setSelectedVersionId(null);
    setEditing(false);
    setSeedKey("");
  }

  function startNew() {
    if (editing && !window.confirm("Discard unsaved changes?")) return;
    setCreating(true);
    setEditing(true);
    setNotes("Initial draft");
    setDraft(JSON.stringify(STARTER, null, 2));
    setSeedKey("creating");
    setFlash(null);
  }

  const saveMut = useMutation({
    mutationFn: () => {
      let parsed: any;
      try { parsed = JSON.parse(draft); }
      catch (e) { throw new Error(`Invalid JSON: ${(e as Error).message}`); }
      if (!parsed.slug || !parsed.title) throw new Error("Post needs at least a slug and a title.");
      return createBlogPostVersion(parsed.slug, parsed, notes.trim() || undefined);
    },
    onSuccess: async (newId, _v) => {
      const parsed = JSON.parse(draft);
      await qc.invalidateQueries({ queryKey: ["blogPosts"] });
      await qc.invalidateQueries({ queryKey: ["blogPostVersions", parsed.slug] });
      setCreating(false);
      setEditing(false);
      setSelectedSlug(parsed.slug);
      setSelectedVersionId(newId);
      setSeedKey("");
      setNotes("");
      setFlash("Saved as a new version. Click 'Set this version live' to publish it.");
    },
    onError: (e) => setError((e as Error).message),
  });

  const liveMut = useMutation({
    mutationFn: (id: string) => setLiveBlogPost(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["blogPosts"] });
      await qc.invalidateQueries({ queryKey: ["blogPostVersions", activeSlug] });
      setFlash("Published. The blog rebuilds on next deploy.");
    },
    onError: (e) => setError((e as Error).message),
  });
  const busy = saveMut.isPending || liveMut.isPending;

  const displayError = error ?? (postsErr ? (postsErr as Error).message : null);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Admin · blog</div>
          <h1 className="page-title">Blog posts</h1>
          <p className="page-sub" style={{ margin: 0 }}>Edit, version, and publish blog posts. The live version renders on the site.</p>
        </div>
        <button className="btn" onClick={startNew} disabled={busy}>+ New post</button>
      </div>

      {displayError && <div className="alert alert-error" style={{ marginBottom: 12 }}><IconAlert size={16} /> <span>{displayError}</span></div>}
      {flash && <div className="alert alert-success" style={{ marginBottom: 12 }}><IconCheck size={16} /> <span>{flash}</span></div>}

      {loadingPosts ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="prompt-editor prompt-editor-grid">
          <aside>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Posts</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {posts.length === 0 && <li style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)" }}>No posts yet.</li>}
              {posts.map((p: BlogSummaryRow) => {
                const isSel = !creating && p.slug === activeSlug;
                return (
                  <li key={p.slug}>
                    <button
                      onClick={() => pickPost(p.slug)}
                      className={`version-row ${isSel ? "active" : ""}`}
                      style={{
                        width: "100%", textAlign: "left", padding: "10px 12px", border: "1px solid",
                        borderColor: isSel ? "var(--ink)" : "var(--line)", background: isSel ? "var(--paper)" : "transparent",
                        borderRadius: 8, cursor: "pointer", fontSize: "var(--fs-data-row)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                        <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</strong>
                        {p.is_live && <span style={{ fontSize: "var(--fs-tiny)", fontWeight: "var(--fw-bold)", color: "var(--income)" }}>● LIVE</span>}
                      </div>
                      <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 3 }}>{p.slug} · v{p.version}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section>
            <div className="voice-header">
              <div className="voice-header-meta">
                <div className="voice-header-title">{creating ? "New post" : selectedVersion ? `Version ${selectedVersion.version}` : "—"}</div>
                <div className="voice-header-sub">
                  {!creating && selectedVersion?.is_live && <span className="badge badge-live">● Live</span>}
                  {!creating && selectedVersion && !selectedVersion.is_live && <span className="badge badge-draft">Draft</span>}
                </div>
              </div>
              <div className="voice-header-actions">
                {!editing && !creating && (
                  <>
                    <button className="btn" onClick={() => setEditing(true)} disabled={!selectedVersion}>Edit</button>
                    {selectedVersion && !selectedVersion.is_live && (
                      <button className="btn primary" onClick={() => liveMut.mutate(selectedVersion.id)} disabled={busy}>Set this version live</button>
                    )}
                  </>
                )}
                {editing && (
                  <>
                    <button className="btn" onClick={() => { setEditing(false); setCreating(false); setSeedKey(""); }} disabled={busy}>Cancel</button>
                    <button className="btn primary" onClick={() => saveMut.mutate()} disabled={busy || !draft.trim()}>
                      {busy ? "Saving…" : "Save as new version"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Version history for the selected post */}
            {!creating && versions.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {versions.map((v) => (
                  <button key={v.id} className={`tab ${(selectedVersion?.id === v.id) ? "active" : ""}`}
                    onClick={() => { setSelectedVersionId(v.id); setSeedKey(""); setEditing(false); }}>
                    v{v.version}{v.is_live ? " ●" : ""}
                  </button>
                ))}
              </div>
            )}

            {editing ? (
              <div style={{ display: "grid", gap: 10 }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={26}
                  spellCheck={false}
                  aria-label="Post JSON"
                  style={{
                    width: "100%", fontFamily: "var(--font-mono)", fontSize: "max(16px, var(--fs-data-row))",
                    lineHeight: 1.5, padding: 12, border: "1px solid var(--line)", borderRadius: 8,
                    resize: "vertical", boxSizing: "border-box", background: "var(--white)",
                  }}
                />
                <input
                  type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="What changed in this version? (optional)" aria-label="Version notes"
                  style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, boxSizing: "border-box", fontSize: "max(16px, var(--fs-data-row))" }}
                />
                <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)" }}>
                  Edit the post as JSON (title, description, date, readMins, tag, takeaways[], body[]). Body blocks: {"{p}"}, {"{h}"}, {"{quote}"}, {"{callout}"}, {"{stats}"}, {"{visual}"}.
                </div>
              </div>
            ) : selectedVersion ? (
              <pre style={{ background: "var(--white)", border: "1px solid var(--line)", borderRadius: 8, padding: 14, overflow: "auto", fontSize: "var(--fs-eyebrow)", maxHeight: 520 }}>
                {JSON.stringify(selectedVersion.payload, null, 2)}
              </pre>
            ) : (
              <div className="empty">Select a post or create a new one.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
