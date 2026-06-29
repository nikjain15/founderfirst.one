import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  listOutreachPersona,
  createOutreachPersonaVersion,
  setLiveOutreachPersona,
  type OutreachPersonaRow,
  type OutreachSurface,
} from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";

/**
 * Outreach task-note editor — the small, surface-specific instruction block that
 * each outreach surface layers ON TOP of the single shared Voice guide. Same
 * pattern as the Discord persona: one canonical voice, one task note per surface.
 *
 *   Signals  → the public-thread reply rules (signals-worker draft()).
 *   Email    → the transactional/announcement email rules (email compose).
 *
 * Both read the live Voice guide at runtime, then this note, then a code-held
 * output contract. Editing here changes the live behaviour with no redeploy
 * (~60s for Signals; next compose for Email).
 */

type SurfaceMeta = {
  id: OutreachSurface;
  label: string;
  // Starter shown in the empty state — MUST stay in sync with the runtime
  // fallback constant AND the migration seed for this surface:
  //   signals → SIGNALS_PERSONA_BASE (tools/signals-worker/brain.mjs)
  //   email   → EMAIL_PERSONA_BASE   (tools/signals-worker/compose-server.mjs)
  //   seed    → migration 20260629120000_outreach_persona.sql
  starter: string;
  // Where the live version is consumed, shown in the footnote.
  consumedBy: string;
};

const SURFACES: SurfaceMeta[] = [
  {
    id: "signals",
    label: "Signals outreach",
    consumedBy:
      "the Signals worker when it drafts a reply for a promoted lead (cached ~60s)",
    starter: `You draft short, problem-driven outreach for FounderFirst, a bookkeeping/accounting service for US founders, freelancers, and small businesses. You are replying in a public/community thread.

Rules:
- Reference a SPECIFIC detail from their post so it's obviously not a template.
- Open with a concrete, useful insight about their exact problem — never flattery, never "congrats" or "sounds like you've built something real".
- Lead with real help on THEIR exact problem. Mention FounderFirst in at most ONE sentence, only if it fits naturally — otherwise not at all.
- Never hard-sell. No "we help businesses like yours", no feature lists.
- Don't claim to be a fellow founder or invent facts about them.
- Plain, human, specific. Under 80 words. Write ONLY the message body — no subject, preamble, or quotes.`,
  },
  {
    id: "email",
    label: "Email",
    consumedBy: "the email composer when you Draft with AI (Settings → Emails)",
    starter: `You write short transactional/announcement emails for FounderFirst, a bookkeeping and accounting service for US founders, freelancers, and small-business owners.

Rules:
- Write for a non-technical reader; plain, warm, and useful — never salesy or hypey.
- Do not invent specific numbers, dates, or names that the brief didn't give you. Keep it honest and concrete.
- Do not use {curly-brace} placeholders.
- Never name the underlying technology, and never approximate a price.
- Sign off as "— The FounderFirst team".`,
  },
];

export function ContentOutreach() {
  const [surface, setSurface] = useState<OutreachSurface>("signals");

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Outreach surface" style={{ marginBottom: 16 }}>
        {SURFACES.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={surface === s.id}
            className={`tab ${surface === s.id ? "active" : ""}`}
            onClick={() => setSurface(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="page-sub" style={{ marginTop: 0, marginBottom: 16 }}>
        One <a href="/content#voice">Voice guide</a> drives every surface. Each surface adds a small
        task note on top — what THIS message is for. Editing it changes the live behaviour, no redeploy.
      </p>

      {/* Remount per surface so the editor's draft seeds cleanly on switch. */}
      <OutreachEditor key={surface} meta={SURFACES.find((s) => s.id === surface)!} />
    </div>
  );
}

function OutreachEditor({ meta }: { meta: SurfaceMeta }) {
  const qc = useQueryClient();
  const surface = meta.id;

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
    queryKey: ["outreachPersona", surface],
    queryFn: () => listOutreachPersona(surface),
  });

  const seededId = selectedId ?? (rows.find((r) => r.is_live) ?? rows[0])?.id ?? null;
  const selected = useMemo(
    () => rows.find((r) => r.id === seededId) ?? null,
    [rows, seededId],
  );

  // One-time draft seed: live/newest body if a version exists, else the starter
  // (which equals the runtime baked-in fallback) so the admin sees what's live.
  if (!seeded && !loading) {
    setSeeded(true);
    if (selected) {
      setSelectedId(selected.id);
      setDraft(selected.body);
      setNotes("");
    } else {
      setDraft(meta.starter);
      setNotes("Initial draft");
    }
  }

  const dirty = selected
    ? draft !== selected.body
    : draft.trim().length > 0 && draft !== meta.starter;

  function pickVersion(r: OutreachPersonaRow) {
    if (editing && dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    setSelectedId(r.id);
    setDraft(r.body);
    setNotes("");
    setEditing(false);
  }

  function cancelEditing() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    if (selected) setDraft(selected.body);
    else setDraft(meta.starter);
    setNotes(selected ? "" : "Initial draft");
    setEditing(false);
  }

  const saveMut = useMutation({
    mutationFn: () => createOutreachPersonaVersion(surface, draft, notes.trim() || undefined),
    onSuccess: async (newId) => {
      await qc.invalidateQueries({ queryKey: ["outreachPersona", surface] });
      setSelectedId(newId);
      setNotes("");
      setEditing(false);
      setFlash("Saved as a new version. Click 'Set this version live' to publish it.");
    },
    onError: (e) => setError((e as Error).message),
  });

  const setLiveMut = useMutation({
    mutationFn: (id: string) => setLiveOutreachPersona(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["outreachPersona", surface] });
      if (selected) setFlash(`${meta.label} task note v${selected.version} is now live.`);
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
    if (!window.confirm(`Set ${meta.label} task note v${selected.version} live?`)) return;
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
                <>Showing the current built-in task note. Review, optionally edit, then save as version 1.</>
              ) : (
                <>
                  {selected?.is_live && <span className="badge badge-live">● Live</span>}
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
              <strong>How this works.</strong> This is the {meta.label.toLowerCase()} task note — what
              this message is for. The live version is read by {meta.consumedBy}, layered on top of the
              shared <a href="/content#voice">Voice guide</a> (tone, every surface) and a built-in
              output format. Change the tone once in Voice; change this only for {meta.label.toLowerCase()}-specific rules.
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={20}
              aria-label={`${meta.label} task note`}
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
