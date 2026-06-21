import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  listPrompts,
  createPromptVersion,
  setLivePrompt,
  type PromptRow,
} from "../lib/supabase";
import { IconAlert, IconCheck, IconChevronDown } from "../lib/icons";

/**
 * Mirror of site-bubble/worker/src/prompt-guardrails.ts — shown read-only at the
 * top of the editor so admins know what's enforced in code (and therefore NOT
 * editable here). Keep in sync if you change the Worker file.
 */
const LOCKED_GUARDRAILS_PREVIEW = `# Penny — locked runtime contract

## Output format — always JSON
(JSON schema, bubble rules, CTA shape — load-bearing for the parser)

## Reading the input
(<site_content> / <session_state> runtime injection contract — load-bearing for behavior)`;

/**
 * Penny system prompt editor.
 *
 * Mental model:
 *   - The table `penny_prompts` stores every saved version.
 *   - Exactly one row can be `is_live = true`. The Worker fetches it at runtime.
 *   - "Save as new version" creates a new row but does NOT set it live.
 *   - "Set live" flips the live flag — that's the only action visible users see.
 *
 * The textarea is always editable. If its contents differ from the currently
 * selected version, we show "Unsaved changes" and the Save button becomes
 * primary. There's no separate "edit mode" — it's all just text.
 */
export function ContentPrompt() {
  const qc = useQueryClient();

  // Selection / draft are real UI state. selectedId starts null and is seeded
  // from the live (or first) row once the query resolves — see seededId below.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Version list — cached. The query owns rows + load/error state.
  const {
    data: rows = [],
    isPending: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["prompts"],
    queryFn: listPrompts,
  });

  // Default selection: pick live (or newest) the first time rows arrive and we
  // haven't selected anything yet. Mirrors the old refresh(false) seeding.
  const seededId = selectedId ?? (rows.find((r) => r.is_live) ?? rows[0])?.id ?? null;
  const selected = useMemo(
    () => rows.find((r) => r.id === seededId) ?? null,
    [rows, seededId],
  );

  // Sync draft to the seeded selection until the user picks/edits. We only
  // overwrite the draft when it's empty (initial mount) to avoid clobbering text.
  if (selectedId === null && selected && draft === "") {
    setSelectedId(selected.id);
    setDraft(selected.body);
  }

  const dirty = selected ? draft !== selected.body : draft.trim().length > 0;
  const live = useMemo(() => rows.find((r) => r.is_live) ?? null, [rows]);

  function pickVersion(r: PromptRow) {
    if (dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    setSelectedId(r.id);
    setDraft(r.body);
    setNotes("");
  }

  // Create a new version — invalidate ["prompts"], then select the new row.
  const saveMut = useMutation({
    mutationFn: () => createPromptVersion(draft, notes.trim() || undefined),
    onSuccess: async (newId) => {
      await qc.invalidateQueries({ queryKey: ["prompts"] });
      setSelectedId(newId);
      setNotes("");
      setFlash("Saved as new version. Click 'Set live' to publish.");
    },
    onError: (e) => setError((e as Error).message),
  });

  // Flip the live flag — invalidate ["prompts"] and ["livePrompt"]; keep selection.
  const setLiveMut = useMutation({
    mutationFn: (id: string) => setLivePrompt(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["prompts"] });
      void qc.invalidateQueries({ queryKey: ["livePrompt"] });
      if (selected) setFlash(`Version ${selected.version} is now live.`);
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
      window.alert("You have unsaved changes. Save them as a new version first, then set live.");
      return;
    }
    if (!window.confirm(`Set version ${selected.version} live? Penny will use it on the next request.`)) return;
    setError(null);
    setLiveMut.mutate(selected.id);
  }

  if (loading) return <div className="empty">Loading…</div>;

  // A read error (query) or a write error (mutation) render in the same banner.
  const displayError = error ?? (queryError ? (queryError as Error).message : null);

  // First-run empty state.
  if (rows.length === 0 && !displayError) {
    return (
      <div className="prompt-editor">
        <div className="empty" style={{ marginBottom: 16 }}>
          <p className="empty-title">No prompt versions yet.</p>
          <p>Paste your current system prompt below and click <strong>Save as new version</strong> to seed v1. Then click <strong>Set live</strong> to put it in production.</p>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={20}
          placeholder="# Penny — Site Bubble System Prompt&#10;&#10;You are Penny, an AI bookkeeper for…"
          style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "var(--fs-data-row)", lineHeight: 1.5 }}
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
      {/* Left: version list */}
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
                    border: "1px solid var(--line)",
                    borderColor: isSel ? "var(--ink)" : "var(--line)",
                    background: isSel ? "var(--paper)" : "transparent",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: "var(--fs-data-row)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>v{r.version}</strong>
                    {r.is_live && (
                      <span style={{ fontSize: "var(--fs-tiny)", fontWeight: "var(--fw-semibold)", color: "var(--income)" }}>
                        ● LIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 2 }}>
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  {r.notes && (
                    <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 2, fontStyle: "italic" }}>
                      {r.notes.length > 60 ? r.notes.slice(0, 60) + "…" : r.notes}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Right: editor */}
      <section>
        <LockedGuardrailsNotice />
        {displayError && (
          <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)", marginBottom: 12 }}>
            <IconAlert size={18} /> {displayError}
          </div>
        )}
        {flash && (
          <div className="empty" style={{ color: "var(--income)", borderColor: "var(--income-bg)", marginBottom: 12 }}>
            <IconCheck size={18} /> {flash}
          </div>
        )}

        {selected && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-3)" }}>
              Editing <strong>v{selected.version}</strong>
              {selected.is_live && <span style={{ marginLeft: 8, color: "var(--income)" }}>● LIVE</span>}
              {dirty && <span style={{ marginLeft: 8, color: "var(--amber)" }}>● Unsaved changes</span>}
              {selected.created_by_email && (
                <span style={{ marginLeft: 8 }}> · by {selected.created_by_email}</span>
              )}
            </div>
            {live && selected.id !== live.id && (
              <span style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)" }}>
                Live is v{live.version}
              </span>
            )}
          </div>
        )}

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={24}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-data-row)",
            lineHeight: 1.55,
            padding: 12,
            border: "1px solid var(--line)",
            borderRadius: 6,
            resize: "vertical",
          }}
        />

        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional) — what changed in this version?"
          style={{ width: "100%", marginTop: 8, padding: 8, border: "1px solid var(--line)", borderRadius: 6 }}
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
          <div style={{ marginLeft: "auto", fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)" }}>
            {draft.length.toLocaleString()} chars · ~{Math.ceil(draft.length / 4).toLocaleString()} tokens
          </div>
        </div>
      </section>
    </div>
  );
}

function LockedGuardrailsNotice() {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        background: "var(--paper)",
        borderRadius: 6,
        padding: "8px 12px",
        marginBottom: 12,
        fontSize: "var(--fs-eyebrow)",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--ink-3)",
          fontSize: "var(--fs-eyebrow)",
        }}
      >
        <span style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>
          <IconChevronDown size={12} />
        </span>
        🔒 Locked guardrails (prepended automatically — not editable here)
      </button>
      {open && (
        <pre
          style={{
            margin: "8px 0 0 0",
            padding: 10,
            background: "var(--white)",
            border: "1px solid var(--line)",
            borderRadius: 4,
            fontSize: "var(--fs-eyebrow)",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            color: "var(--ink-3)",
          }}
        >
{LOCKED_GUARDRAILS_PREVIEW}
        </pre>
      )}
    </div>
  );
}
