import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { marked } from "marked";
import {
  listVoice,
  createVoiceVersion,
  setLiveVoice,
  type VoiceRow,
} from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";
// Repo-root VOICE.md, bundled as a string so the empty-state editor seeds
// from the canonical file instead of an empty textarea. After v1 is saved
// the live serving voice is always whatever was last published from here.
import VOICE_MD from "../../../../VOICE.md?raw";

marked.setOptions({ gfm: true, breaks: false });

/**
 * Voice guide editor — designed for non-technical users.
 *
 * Default view is a *rendered* markdown preview (headings, bold, tables, lists).
 * Editing is opt-in via a button; when editing, a live rendered preview sits
 * underneath the textarea so the author sees the final shape as they type.
 */
export function ContentVoice() {
  const qc = useQueryClient();

  // Selection / draft / editing are real UI state. selectedId seeds from the
  // live (or newest) row once the query resolves; see seededId below.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Tracks whether the initial draft seed has run, so re-renders don't clobber
  // the textarea once the user (or a mutation) has set its contents.
  const [seeded, setSeeded] = useState(false);

  // Version history — cached. The query owns rows + load/error state.
  const {
    data: rows = [],
    isPending: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["voice"],
    queryFn: listVoice,
  });

  const seededId = selectedId ?? (rows.find((r) => r.is_live) ?? rows[0])?.id ?? null;
  const selected = useMemo(
    () => rows.find((r) => r.id === seededId) ?? null,
    [rows, seededId],
  );

  // One-time draft seed mirroring the old refresh(false): live/newest body if a
  // version exists, otherwise the repo's VOICE.md as a starter draft.
  if (!seeded && !loading) {
    setSeeded(true);
    if (selected) {
      setSelectedId(selected.id);
      setDraft(selected.body);
      setNotes("");
    } else {
      setDraft(VOICE_MD);
      setNotes("Initial draft");
    }
  }

  const dirty = selected ? draft !== selected.body : draft.trim().length > 0 && draft !== VOICE_MD;
  const rendered = useMemo(() => {
    const html = marked.parse(draft || "_(empty)_") as string;
    return upgradeRenderedHtml(html);
  }, [draft]);

  function pickVersion(r: VoiceRow) {
    if (editing && dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    setSelectedId(r.id);
    setDraft(r.body);
    setNotes("");
    setEditing(false);
  }

  function startEditing() {
    setEditing(true);
    setFlash(null);
  }

  function cancelEditing() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    if (selected) setDraft(selected.body);
    else setDraft(VOICE_MD);
    setNotes(selected ? "" : "Initial draft");
    setEditing(false);
  }

  // Create a new version — invalidate ["voice"], then select the new row and
  // drop out of edit mode. The newly-saved body is its own canonical text.
  const saveMut = useMutation({
    mutationFn: () => createVoiceVersion(draft, notes.trim() || undefined),
    onSuccess: async (newId) => {
      await qc.invalidateQueries({ queryKey: ["voice"] });
      setSelectedId(newId);
      setNotes("");
      setEditing(false);
      setFlash("Saved as a new version. Click 'Set this version live' to publish it to every Penny surface.");
    },
    onError: (e) => setError((e as Error).message),
  });

  // Flip the live flag — invalidate ["voice"] and ["liveVoice"]; keep selection.
  const setLiveMut = useMutation({
    mutationFn: (id: string) => setLiveVoice(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["voice"] });
      void qc.invalidateQueries({ queryKey: ["liveVoice"] });
      if (selected) setFlash(`Voice v${selected.version} is now live. Open the Penny bubble on founderfirst.one to verify within a minute.`);
    },
    onError: (e) => setError((e as Error).message),
  });
  const saving = saveMut.isPending || setLiveMut.isPending;

  function handleSave() {
    if (!draft.trim()) return;
    setError(null);
    setFlash(null);
    saveMut.mutate();
  }

  function handleSetLive() {
    if (!selected) return;
    if (selected.is_live) return;
    if (dirty) {
      window.alert("You have unsaved changes. Save them first, then set live.");
      return;
    }
    if (!window.confirm(`Set Voice v${selected.version} live? Every Penny surface will pick it up within ~60 seconds.`)) return;
    setError(null);
    setLiveMut.mutate(selected.id);
  }

  if (loading) return <div className="empty">Loading…</div>;

  // Read error (query) and write errors (mutations) render in the same banner.
  const displayError = error ?? (queryError ? (queryError as Error).message : null);

  const noVersionsYet = rows.length === 0;

  return (
    <div className="prompt-editor prompt-editor-grid">
      {/* Left: version list (hidden when no versions exist yet) */}
      {!noVersionsYet && (
        <aside>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Version history</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {rows.map((r) => {
              const isSel = r.id === selectedId;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => pickVersion(r)}
                    className={`version-row ${isSel ? "active" : ""}`}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "1px solid var(--line)",
                      borderColor: isSel ? "var(--ink)" : "var(--line)",
                      background: isSel ? "var(--paper)" : "transparent",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: "var(--fs-data-row)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>Version {r.version}</strong>
                      {r.is_live && (
                        <span style={{ fontSize: "var(--fs-tiny)", fontWeight: "var(--fw-bold)", color: "var(--income)" }}>
                          ● LIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 3 }}>
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                    {r.notes && (
                      <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 3, fontStyle: "italic" }}>
                        {r.notes.length > 60 ? r.notes.slice(0, 60) + "…" : r.notes}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      )}

      {/* Right: viewer / editor */}
      <section style={noVersionsYet ? { gridColumn: "1 / -1" } : undefined}>
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

        {/* Header row: title + status + action buttons */}
        <div className="voice-header">
          <div className="voice-header-meta">
            <div className="voice-header-title">
              {noVersionsYet
                ? "Draft — not saved yet"
                : `Version ${selected?.version ?? "?"}`}
            </div>
            <div className="voice-header-sub">
              {noVersionsYet ? (
                <>Starter draft loaded. Review, optionally edit, then save as version 1.</>
              ) : (
                <>
                  {selected?.is_live && <span className="badge badge-live">● Live on every surface</span>}
                  {!selected?.is_live && <span className="badge badge-draft">Draft — not live</span>}
                  {dirty && <span className="badge badge-warn">● Unsaved changes</span>}
                  {selected?.created_by_email && (
                    <span className="voice-header-author">saved by {selected.created_by_email}</span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="voice-header-actions">
            {!editing && (
              <button className="btn" onClick={startEditing}>
                Edit
              </button>
            )}
            {editing && (
              <>
                <button className="btn" onClick={cancelEditing} disabled={saving}>
                  Cancel
                </button>
                <button
                  className="btn primary"
                  onClick={handleSave}
                  disabled={!draft.trim() || saving || !dirty}
                  title={!dirty ? "No changes to save" : ""}
                >
                  {saving ? "Saving…" : noVersionsYet ? "Save as version 1" : "Save as new version"}
                </button>
              </>
            )}
            {!editing && selected && !selected.is_live && (
              <button
                className="btn primary"
                onClick={handleSetLive}
                disabled={saving}
              >
                Set this version live
              </button>
            )}
          </div>
        </div>

        {/* Body: rendered view OR editor + live preview */}
        {!editing ? (
          <>
            <RenderedBody html={rendered} />
            <FootnoteHint />
          </>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-semibold)", color: "var(--ink-3)", marginBottom: 4 }}>
                Markdown source
              </label>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={20}
                aria-label="Markdown source"
                style={{
                  width: "100%",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-data-row)",
                  lineHeight: 1.55,
                  padding: 12,
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  resize: "vertical",
                  boxSizing: "border-box",
                  background: "var(--white)",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-semibold)", color: "var(--ink-3)", marginBottom: 4 }}>
                Live preview
              </label>
              <div
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: 16,
                  background: "var(--white)",
                  maxHeight: 400,
                  overflowY: "auto",
                }}
              >
                <RenderedBody html={rendered} />
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-semibold)", color: "var(--ink-3)", marginBottom: 4 }}>
                What changed in this version? (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Softened the off-topic templates; added new banned phrase"
                aria-label="What changed in this version?"
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  boxSizing: "border-box",
                  fontSize: "var(--fs-data-row)",
                }}
              />
            </div>
            <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", textAlign: "right" }}>
              {draft.length.toLocaleString()} characters · ~{Math.ceil(draft.length / 4).toLocaleString()} tokens
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Renders parsed markdown HTML with sensible typography for non-technical
 * readers. Scoped class so styles don't leak.
 */
function RenderedBody({ html }: { html: string }) {
  return (
    <div
      className="voice-rendered"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Walks the rendered HTML and upgrades a few specific patterns into richer
 * visual components — without changing the markdown source of truth.
 *
 *   1. The blockquote whose **bold opener** matches "the one-line test"
 *      becomes a large callout box.
 *   2. Tables whose header row is "Instead of this | Say this" become a
 *      side-by-side card pair (red strikethrough left, green check right).
 *   3. The unordered list following any H2/H3 whose title contains
 *      "banned" becomes a chip row of pill-shaped warning chips.
 *   4. The unordered list following an H2/H3 containing "approved emoji"
 *      becomes a chip row of green chips.
 */
function upgradeRenderedHtml(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;

  // 1. One-line test callout
  root.querySelectorAll("blockquote").forEach((bq) => {
    const opener = bq.querySelector("strong")?.textContent ?? "";
    if (/one[- ]line test/i.test(opener)) bq.classList.add("voice-callout");
  });

  // 2. Say-this / not-that table
  root.querySelectorAll("table").forEach((table) => {
    const ths = Array.from(table.querySelectorAll("thead th")).map((th) =>
      (th.textContent ?? "").trim().toLowerCase(),
    );
    if (ths.length === 2 && ths[0].includes("instead") && ths[1].includes("say this")) {
      table.classList.add("voice-saythis-table");
    }
  });

  // 3 & 4. Heading-driven chip lists
  root.querySelectorAll("h2, h3").forEach((h) => {
    const txt = (h.textContent ?? "").toLowerCase();
    let sib = h.nextElementSibling;
    // Skip any intervening paragraphs (e.g. "These are blocked automatically.")
    while (sib && sib.tagName === "P") sib = sib.nextElementSibling;
    if (!sib || sib.tagName !== "UL") return;

    if (txt.includes("banned")) {
      sib.classList.add("voice-chips", "voice-chips-red");
    } else if (txt.includes("emoji")) {
      // Inside the emoji section the first list (approved) is green.
      // Subsequent strong+ul "Never use" stays as a normal list inline.
      sib.classList.add("voice-chips", "voice-chips-green");
    }
  });

  return root.innerHTML;
}

function FootnoteHint() {
  return (
    <div className="voice-footnote">
      <strong>How this works.</strong> The live version is used by every Penny surface —
      site bubble, support bot, in-product Penny. Edits go live within ~60 seconds of
      clicking <em>Set live</em>; no redeploy. After publishing,{" "}
      <a href="https://founderfirst.one" target="_blank" rel="noreferrer">
        open the Penny bubble to verify →
      </a>
    </div>
  );
}
