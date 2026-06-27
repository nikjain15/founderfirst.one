import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { marked } from "marked";
import {
  listPrompts,
  createPromptVersion,
  setLivePrompt,
  type PromptRow,
} from "../lib/supabase";
import { IconAlert, IconCheck, IconChevronDown } from "../lib/icons";

marked.setOptions({ gfm: true, breaks: false });

/**
 * Mirror of site-bubble/worker/src/prompt-guardrails.ts — shown read-only above
 * the editor so admins know what's enforced in code (and therefore NOT editable
 * here). Keep in sync if you change the Worker file.
 */
const LOCKED_GUARDRAILS_PREVIEW = `# Penny — locked runtime contract

## Output format — always JSON
(JSON schema, bubble rules, CTA shape — load-bearing for the parser)

## Reading the input
(<site_content> / <session_state> runtime injection contract — load-bearing for behavior)`;

/**
 * Penny system prompt editor.
 *
 * Same shape as the Voice guide editor (ContentVoice): a *rendered* preview by
 * default, Edit is opt-in, and a version-history sidebar on the left. The
 * underlying model is unchanged:
 *   - The table `penny_prompts` stores every saved version.
 *   - Exactly one row can be `is_live = true`. The Worker fetches it at runtime.
 *   - "Save as new version" creates a new row but does NOT set it live.
 *   - "Set this version live" flips the live flag.
 */
export function ContentPrompt() {
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const {
    data: rows = [],
    isPending: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["prompts"],
    queryFn: listPrompts,
  });

  const seededId = selectedId ?? (rows.find((r) => r.is_live) ?? rows[0])?.id ?? null;
  const selected = useMemo(
    () => rows.find((r) => r.id === seededId) ?? null,
    [rows, seededId],
  );

  // One-time draft seed: live/newest body if a version exists, else an empty
  // starter the admin pastes into. New versions become their own canonical text.
  if (!seeded && !loading) {
    setSeeded(true);
    if (selected) {
      setSelectedId(selected.id);
      setDraft(selected.body);
    } else {
      // No versions yet → drop straight into edit mode so the empty state is
      // a usable editor, mirroring Voice's "Draft — not saved yet" flow.
      setEditing(true);
      setNotes("Initial draft");
    }
  }

  const dirty = selected ? draft !== selected.body : draft.trim().length > 0;
  const live = useMemo(() => rows.find((r) => r.is_live) ?? null, [rows]);
  const rendered = useMemo(
    () => renderPromptMarkdown(draft || "_(empty)_"),
    [draft],
  );

  function pickVersion(r: PromptRow) {
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
    setDraft(selected ? selected.body : "");
    setNotes(selected ? "" : "Initial draft");
    setEditing(false);
  }

  const saveMut = useMutation({
    mutationFn: () => createPromptVersion(draft, notes.trim() || undefined),
    onSuccess: async (newId) => {
      await qc.invalidateQueries({ queryKey: ["prompts"] });
      setSelectedId(newId);
      setNotes("");
      setEditing(false);
      setFlash("Saved as a new version. Click 'Set this version live' to publish it.");
    },
    onError: (e) => setError((e as Error).message),
  });

  const setLiveMut = useMutation({
    mutationFn: (id: string) => setLivePrompt(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["prompts"] });
      void qc.invalidateQueries({ queryKey: ["livePrompt"] });
      if (selected) setFlash(`Version ${selected.version} is now live. Penny's site bubble will use it within ~60 seconds.`);
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
    if (!window.confirm(`Set version ${selected.version} live? Penny's site bubble will use it on the next request.`)) return;
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

        {/* Header row: title + status + action buttons (same as Voice) */}
        <div className="voice-header">
          <div className="voice-header-meta">
            <div className="voice-header-title">
              {noVersionsYet ? "Draft — not saved yet" : `Version ${selected?.version ?? "?"}`}
            </div>
            <div className="voice-header-sub">
              {noVersionsYet ? (
                <>Paste your system prompt, then save it as version 1.</>
              ) : (
                <>
                  {selected?.is_live && <span className="badge badge-live">● Live on the site bubble</span>}
                  {!selected?.is_live && <span className="badge badge-draft">Draft — not live</span>}
                  {dirty && <span className="badge badge-warn">● Unsaved changes</span>}
                  {live && selected && selected.id !== live.id && (
                    <span className="voice-header-author">live is v{live.version}</span>
                  )}
                  {selected?.created_by_email && (
                    <span className="voice-header-author">saved by {selected.created_by_email}</span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="voice-header-actions">
            {!editing && (
              <button className="btn" onClick={startEditing}>Edit</button>
            )}
            {editing && (
              <>
                <button className="btn" onClick={cancelEditing} disabled={saving}>Cancel</button>
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

        <LockedGuardrailsNotice />

        {/* Body: rendered view OR editor + live preview */}
        {!editing ? (
          <>
            <RenderedBody html={rendered} />
            <PromptFootnote />
          </>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={editorLabel}>System prompt (Markdown)</label>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={22}
                aria-label="System prompt"
                placeholder="# Penny — Site Bubble System Prompt&#10;&#10;You are Penny, an AI bookkeeper for…"
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
            </div>
            <div>
              <label style={editorLabel}>Live preview</label>
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
              <label style={editorLabel}>What changed in this version? (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Tightened the CTA decision tree; new off-topic handling"
                aria-label="What changed in this version?"
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  boxSizing: "border-box",
                  fontSize: "max(16px, var(--fs-data-row))",
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

const editorLabel: React.CSSProperties = {
  display: "block",
  fontSize: "var(--fs-eyebrow)",
  fontWeight: "var(--fw-semibold)",
  color: "var(--ink-3)",
  marginBottom: 4,
};

function RenderedBody({ html }: { html: string }) {
  return <div className="voice-rendered" dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Parse the prompt Markdown and sanitise it before it reaches the DOM via
 * dangerouslySetInnerHTML — same inert-DOMParser approach as ContentVoice.
 */
function renderPromptMarkdown(md: string): string {
  const html = marked.parse(md) as string;
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;
  root.querySelectorAll("script, style, iframe, object, embed, link, meta, base, form").forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.replace(/\s+/g, "").toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if ((name === "href" || name === "src" || name === "xlink:href") && value.startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return root.innerHTML;
}

function PromptFootnote() {
  return (
    <div className="voice-footnote">
      <strong>How this works.</strong> The live version is the editable body of Penny's
      site-bubble prompt — persona, the CTA decision tree, and off-topic handling. The
      locked runtime contract above (JSON output format) is prepended automatically in code.
      Edits go live within ~60 seconds of <em>Set live</em>; no redeploy. The shared{" "}
      <a href="/content#voice">Voice guide</a> applies on top of this across every surface
      (site bubble + Discord).
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
        borderRadius: 8,
        padding: "8px 12px",
        margin: "0 0 16px",
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
