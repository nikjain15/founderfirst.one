import { useEffect, useMemo, useState } from "react";
import {
  listVoice,
  createVoiceVersion,
  setLiveVoice,
  type VoiceRow,
} from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";
// Repo-root VOICE.md, bundled as a string so the empty-state editor seeds
// from the canonical file instead of an empty textarea. Updates to VOICE.md
// will appear here after the next admin build; the live-served voice is
// always whatever was last published from this screen.
import VOICE_MD from "../../../../VOICE.md?raw";

/**
 * Voice guide editor.
 *
 * One canonical voice/tone guide shared by every FounderFirst surface
 * (marketing copy, Penny in-product, site bubble, support bot, Discord bot).
 *
 * Same versioning model as ContentPrompt: every save creates a new row,
 * exactly one row can be is_live = true, the Worker fetches the live row at
 * runtime with a ~60s cache so admin edits go live within a minute without a
 * redeploy.
 */
export function ContentVoice() {
  const [rows, setRows] = useState<VoiceRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
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
        } else {
          // First-run seed: pre-fill the editor with the canonical VOICE.md
          // from the repo so the admin can review/edit before saving v1
          // instead of pasting from scratch.
          setSelectedId(null);
          setDraft(VOICE_MD);
          setNotes("Seeded from VOICE.md");
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

  const dirty = selected ? draft !== selected.body : draft.trim().length > 0;
  const live = useMemo(() => rows.find((r) => r.is_live) ?? null, [rows]);

  function pickVersion(r: VoiceRow) {
    if (dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    setSelectedId(r.id);
    setDraft(r.body);
    setNotes("");
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
      setFlash("Saved as new version. Click 'Set live' to publish across every surface.");
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
      window.alert("You have unsaved changes. Save them as a new version first, then set live.");
      return;
    }
    if (!window.confirm(`Set Voice v${selected.version} live? Every Penny surface will pick it up within ~60s.`)) return;
    setSaving(true);
    setError(null);
    try {
      await setLiveVoice(selected.id);
      await refresh(true);
      setFlash(`Voice v${selected.version} is now live. Bots will pick it up within ~60s — open the Penny bubble to verify.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="empty">Loading…</div>;

  if (rows.length === 0 && !error) {
    return (
      <div className="prompt-editor">
        <ContextBanner />
        <div className="empty" style={{ marginBottom: 16 }}>
          <p className="empty-title">No voice versions yet.</p>
          <p>The editor below is pre-loaded with the current <code>VOICE.md</code> from the repo. Review or tweak, then click <strong>Save as new version</strong> to seed v1. Then click <strong>Set live</strong> and every surface that reads the voice (Penny site bubble, support bot, in-product Penny) will pick it up on its next request.</p>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={24}
          placeholder="# FounderFirst Voice — Canonical&#10;&#10;Warm. Direct. Honest.&#10;…"
          style={{ width: "100%", fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 13, lineHeight: 1.5 }}
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional) — what changed in this version?"
          style={{ width: "100%", marginTop: 8 }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn primary" onClick={handleSave} disabled={!draft.trim() || saving}>
            {saving ? "Saving…" : "Save as new version"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="prompt-editor prompt-editor-grid">
      <aside>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Versions</div>
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
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderColor: isSel ? "var(--accent)" : "var(--border)",
                    background: isSel ? "var(--surface-2, #f6f6f6)" : "transparent",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>v{r.version}</strong>
                    {r.is_live && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--success, #0a7c2f)" }}>
                        ● LIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  {r.notes && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>
                      {r.notes.length > 60 ? r.notes.slice(0, 60) + "…" : r.notes}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section>
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

        {selected && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Editing <strong>v{selected.version}</strong>
              {selected.is_live && <span style={{ marginLeft: 8, color: "var(--success, #0a7c2f)" }}>● LIVE</span>}
              {dirty && <span style={{ marginLeft: 8, color: "var(--warning, #b8860b)" }}>● Unsaved changes</span>}
              {selected.created_by_email && (
                <span style={{ marginLeft: 8 }}> · by {selected.created_by_email}</span>
              )}
            </div>
            {live && selected.id !== live.id && (
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                Live is v{live.version}
              </span>
            )}
          </div>
        )}

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={28}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontSize: 13,
            lineHeight: 1.55,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 6,
            resize: "vertical",
          }}
        />

        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional) — what changed in this version?"
          style={{ width: "100%", marginTop: 8, padding: 8, border: "1px solid var(--border)", borderRadius: 6 }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button
            className={`btn ${dirty ? "primary" : ""}`}
            onClick={handleSave}
            disabled={!draft.trim() || saving || !dirty}
            title={!dirty ? "No changes to save" : ""}
          >
            {saving ? "Saving…" : "Save as new version"}
          </button>
          <button
            className="btn"
            onClick={handleSetLive}
            disabled={!selected || selected.is_live || saving || dirty}
            title={selected?.is_live ? "Already live" : dirty ? "Save changes first" : ""}
          >
            {selected?.is_live ? "Currently live" : "Set this version live"}
          </button>
          <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
            {draft.length.toLocaleString()} chars · ~{Math.ceil(draft.length / 4).toLocaleString()} tokens
          </div>
        </div>
      </section>
    </div>
  );
}

function ContextBanner() {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface-2, #fafafa)",
        borderRadius: 6,
        padding: "10px 12px",
        marginBottom: 12,
        fontSize: 12,
        lineHeight: 1.6,
        color: "var(--muted)",
      }}
    >
      <strong style={{ color: "var(--text)" }}>One voice, every surface.</strong> The live version
      is prepended to every Penny system prompt at runtime — site bubble, support bot,
      in-product Penny. Edits go live within ~60s of clicking <em>Set live</em>; no redeploy.
      To verify after publishing, open the Penny bubble on{" "}
      <a href="https://founderfirst.one" target="_blank" rel="noreferrer">founderfirst.one</a>{" "}
      and ask it a question that tests the rule you changed.
      <br />
      <span style={{ display: "inline-block", marginTop: 6 }}>
        <strong style={{ color: "var(--text)" }}>Edit here, not in the repo.</strong>{" "}
        <code>VOICE.md</code> in the repo is the historical seed only — once v1 is saved,
        every change must be made on this screen. File edits won't reach the bots.
      </span>
    </div>
  );
}
