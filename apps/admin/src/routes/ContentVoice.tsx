import { useEffect, useMemo, useState } from "react";
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
  const [rows, setRows] = useState<VoiceRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function refresh(preserveSelection = false) {
    setError(null);
    try {
      const fresh = await listVoice();
      setRows(fresh);
      if (!preserveSelection || !selectedId) {
        const live = fresh.find((r) => r.is_live) ?? fresh[0] ?? null;
        if (live) {
          setSelectedId(live.id);
          setDraft(live.body);
          setNotes("");
          setEditing(false);
        } else {
          // First run — pre-load the repo's VOICE.md as a seed so the admin
          // sees the canonical guide rendered immediately, ready to save as v1.
          setSelectedId(null);
          setDraft(VOICE_MD);
          setNotes("Initial draft");
          setEditing(false);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

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

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const newId = await createVoiceVersion(draft, notes.trim() || undefined);
      await refresh(false);
      setSelectedId(newId);
      setNotes("");
      setEditing(false);
      setFlash("Saved as a new version. Click 'Set this version live' to publish it to every Penny surface.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSetLive() {
    if (!selected) return;
    if (selected.is_live) return;
    if (dirty) {
      window.alert("You have unsaved changes. Save them first, then set live.");
      return;
    }
    if (!window.confirm(`Set Voice v${selected.version} live? Every Penny surface will pick it up within ~60 seconds.`)) return;
    setSaving(true);
    setError(null);
    try {
      await setLiveVoice(selected.id);
      await refresh(true);
      setFlash(`Voice v${selected.version} is now live. Open the Penny bubble on founderfirst.one to verify within a minute.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="empty">Loading…</div>;

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
                      border: "1px solid var(--border)",
                      borderColor: isSel ? "var(--accent, #000)" : "var(--border)",
                      background: isSel ? "var(--surface-2, #f6f6f6)" : "transparent",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>Version {r.version}</strong>
                      {r.is_live && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--success, #0a7c2f)" }}>
                          ● LIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                    {r.notes && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, fontStyle: "italic" }}>
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
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            <IconAlert size={16} /> <span>{error}</span>
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
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>
                Markdown source
              </label>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={20}
                style={{
                  width: "100%",
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                  fontSize: 13,
                  lineHeight: 1.55,
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  resize: "vertical",
                  boxSizing: "border-box",
                  background: "var(--surface, #fff)",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>
                Live preview
              </label>
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 16,
                  background: "var(--surface, #fff)",
                  maxHeight: 400,
                  overflowY: "auto",
                }}
              >
                <RenderedBody html={rendered} />
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>
                What changed in this version? (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Softened the off-topic templates; added new banned phrase"
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  boxSizing: "border-box",
                  fontSize: 13,
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
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
