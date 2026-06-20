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
          setNotes("Seeded from VOICE.md");
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
  const live = useMemo(() => rows.find((r) => r.is_live) ?? null, [rows]);
  const rendered = useMemo(() => marked.parse(draft || "_(empty)_") as string, [draft]);

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
    setNotes(selected ? "" : "Seeded from VOICE.md");
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
        <ContextBanner />

        {error && (
          <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)", marginBottom: 12 }}>
            <IconAlert size={18} /> {error}
          </div>
        )}
        {flash && (
          <div className="empty" style={{ color: "var(--success, #0a7c2f)", borderColor: "var(--success-bg, #d6f0db)", marginBottom: 12 }}>
            <IconCheck size={18} /> {flash}
          </div>
        )}

        {noVersionsYet && (
          <div className="empty" style={{ marginBottom: 12 }}>
            <p className="empty-title">Welcome — let's seed your first version.</p>
            <p>
              The voice guide below is the canonical <code>VOICE.md</code> from the repo.
              Review it, click <strong>Edit</strong> if you want to tweak anything,
              then click <strong>Save as version 1</strong>. After that, click <strong>Set live</strong>{" "}
              and every Penny surface will use it within a minute.
            </p>
          </div>
        )}

        {/* Header row: version label + action buttons */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            padding: "8px 0",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {selected ? (
              <>
                Viewing <strong>Version {selected.version}</strong>
                {selected.is_live && <span style={{ marginLeft: 8, color: "var(--success, #0a7c2f)", fontWeight: 700 }}>● LIVE</span>}
                {dirty && <span style={{ marginLeft: 8, color: "var(--warning, #b8860b)", fontWeight: 700 }}>● Unsaved changes</span>}
                {selected.created_by_email && (
                  <span style={{ marginLeft: 8 }}> · saved by {selected.created_by_email}</span>
                )}
              </>
            ) : (
              <>
                <strong>Draft</strong> (not saved yet)
                {dirty && <span style={{ marginLeft: 8, color: "var(--warning, #b8860b)", fontWeight: 700 }}>● Unsaved changes</span>}
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                  {saving ? "Saving…" : "Save as new version"}
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
          <RenderedBody html={rendered} />
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

function ContextBanner() {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface-2, #fafafa)",
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 16,
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--muted)",
      }}
    >
      <div>
        <strong style={{ color: "var(--text)" }}>One voice, every surface.</strong> The live
        version is prepended to every Penny system prompt at runtime — site bubble, support
        bot, in-product Penny. Edits go live within ~60 seconds of clicking <em>Set live</em>,
        with no redeploy. To verify after publishing, open the Penny bubble on{" "}
        <a href="https://founderfirst.one" target="_blank" rel="noreferrer">founderfirst.one</a>{" "}
        and ask it a question that tests the rule you changed.
      </div>
      <div style={{ marginTop: 8 }}>
        <strong style={{ color: "var(--text)" }}>Edit here, not in the repo.</strong>{" "}
        <code>VOICE.md</code> in the repo is the historical seed only — once version 1 is
        saved, every change must be made on this screen. File edits won't reach the bots.
      </div>
    </div>
  );
}
