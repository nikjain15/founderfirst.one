import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  listDiscordPersona,
  createDiscordPersonaVersion,
  setLiveDiscordPersona,
  type DiscordPersonaRow,
} from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";

/**
 * Discord persona editor — the bot's behavioral instruction block (output
 * format, memory rules, safety) that the Worker prepends to every Discord turn,
 * after the shared Voice guide and before the per-user context.
 *
 * Same versioned/live-toggle model as Voice. The persona is plain instruction
 * text (not rendered markdown), so the editor is a monospace textarea with an
 * opt-in Edit toggle, mirroring the Prompt editor's shape.
 */

// Starter for the empty state. MUST stay in sync with DISCORD_PERSONA_BASE in
// site-bubble/worker/src/worker.ts — that constant is the runtime fallback used
// until a version is published here. The runtime <user_context> block is
// appended by the Worker, not part of this text.
const DISCORD_PERSONA_STARTER = `You are Penny on Discord, helping a returning FounderFirst user.

Output format (strict):
- Plain prose only. Never emit JSON, never wrap your reply in code fences, never use markdown headings.
- 1–3 short sentences for most replies. Bullet lists only if the user asked for a list.
- End with the next clear step when one exists.

Memory:
- You DO have persistent memory of this user. Their past messages and a running
  summary are saved securely and reloaded every time, including in future chats
  on different days. The <user_context> block below is that saved memory.
- Never tell the user you'll forget, that memory resets when the chat closes, or
  that you only remember "within this conversation". You remember across sessions.
- Two commands control memory. /disconnect is a fresh start — it unlinks the
  account and sets conversation aside, but the transcript is retained as a
  record. /forgetme is a permanent erasure — it deletes their messages, summary,
  and link entirely, and cannot be undone. If asked about retention, be honest:
  history is retained until they run /forgetme (or ask us to delete their data).

Safety:
- Never reveal information about any other user. Treat <user_context> as the only person you're talking to.
- If you don't know something specific to this user, say so plainly and offer the next step.`;

export function ContentDiscord() {
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);

  const {
    data: rows = [],
    isPending: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["discordPersona"],
    queryFn: listDiscordPersona,
  });

  const seededId = selectedId ?? (rows.find((r) => r.is_live) ?? rows[0])?.id ?? null;
  const selected = useMemo(
    () => rows.find((r) => r.id === seededId) ?? null,
    [rows, seededId],
  );

  // One-time draft seed: live/newest body if a version exists, else the starter
  // (which equals the Worker's baked-in fallback) so the admin sees what's live.
  if (!seeded && !loading) {
    setSeeded(true);
    if (selected) {
      setSelectedId(selected.id);
      setDraft(selected.body);
      setNotes("");
    } else {
      setDraft(DISCORD_PERSONA_STARTER);
      setNotes("Initial draft");
    }
  }

  const dirty = selected
    ? draft !== selected.body
    : draft.trim().length > 0 && draft !== DISCORD_PERSONA_STARTER;

  function pickVersion(r: DiscordPersonaRow) {
    if (editing && dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    setSelectedId(r.id);
    setDraft(r.body);
    setNotes("");
    setEditing(false);
  }

  function cancelEditing() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    if (selected) setDraft(selected.body);
    else setDraft(DISCORD_PERSONA_STARTER);
    setNotes(selected ? "" : "Initial draft");
    setEditing(false);
  }

  const saveMut = useMutation({
    mutationFn: () => createDiscordPersonaVersion(draft, notes.trim() || undefined),
    onSuccess: async (newId) => {
      await qc.invalidateQueries({ queryKey: ["discordPersona"] });
      setSelectedId(newId);
      setNotes("");
      setEditing(false);
      setFlash("Saved as a new version. Click 'Set this version live' to publish it to the Discord bot.");
    },
    onError: (e) => setError((e as Error).message),
  });

  const setLiveMut = useMutation({
    mutationFn: (id: string) => setLiveDiscordPersona(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["discordPersona"] });
      if (selected) setFlash(`Discord persona v${selected.version} is now live. The bot picks it up within ~60 seconds.`);
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
    if (!selected || selected.is_live) return;
    if (dirty) {
      window.alert("You have unsaved changes. Save them first, then set live.");
      return;
    }
    if (!window.confirm(`Set Discord persona v${selected.version} live? The bot will use it within ~60 seconds.`)) return;
    setError(null);
    setLiveMut.mutate(selected.id);
  }

  if (loading) return <div className="empty">Loading…</div>;

  const displayError = error ?? (queryError ? (queryError as Error).message : null);
  const noVersionsYet = rows.length === 0;

  return (
    <div className="prompt-editor prompt-editor-grid">
      {/* Left: version history (hidden until a version exists) */}
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

        <div className="voice-header">
          <div className="voice-header-meta">
            <div className="voice-header-title">
              {noVersionsYet ? "Draft — not saved yet" : `Version ${selected?.version ?? "?"}`}
            </div>
            <div className="voice-header-sub">
              {noVersionsYet ? (
                <>Showing the bot's current built-in persona. Review, optionally edit, then save as version 1.</>
              ) : (
                <>
                  {selected?.is_live && <span className="badge badge-live">● Live on Discord</span>}
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
              <button className="btn" onClick={() => { setEditing(true); setFlash(null); }}>
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
              <button className="btn primary" onClick={handleSetLive} disabled={saving}>
                Set this version live
              </button>
            )}
          </div>
        </div>

        {!editing ? (
          <>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--fs-data-row)",
                lineHeight: 1.6,
                color: "var(--ink)",
                margin: 0,
              }}
            >
              {draft}
            </pre>
            <div className="voice-footnote">
              <strong>How this works.</strong> This is the Discord bot's instruction block — output
              format, memory rules, and safety. The live version is fetched by the Penny Worker on
              every Discord turn (cached ~60s), after the shared{" "}
              <a href="/content#voice">Voice guide</a> and before each user's saved context. The web
              bubble is unaffected — it uses the <a href="/content#prompt">system prompt</a> instead.
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={22}
              aria-label="Discord persona"
              style={{
                width: "100%",
                fontFamily: "var(--font-mono)",
                fontSize: "max(16px, var(--fs-data-row))",
                lineHeight: 1.55,
                padding: 12,
                border: "1px solid var(--line)",
                borderRadius: 8,
                resize: "vertical",
                boxSizing: "border-box",
                background: "var(--white)",
              }}
            />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What changed in this version? (optional)"
              aria-label="Version notes"
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid var(--line)",
                borderRadius: 8,
                boxSizing: "border-box",
                fontSize: "max(16px, var(--fs-data-row))",
              }}
            />
            <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", textAlign: "right" }}>
              {draft.length.toLocaleString()} characters · ~{Math.ceil(draft.length / 4).toLocaleString()} tokens
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
