import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Page, emptyPage, emptySection, SECTION_TYPES } from "@ff/content";
import {
  listContentPages,
  listPageVersions,
  createPageVersion,
  setLivePage,
} from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";
import { ContentSubnav } from "./ContentSubnav";

/**
 * Site content editor — edit the published copy of marketing pages, versioned
 * exactly like the Voice guide (history · live-toggle · activity). Each page is
 * one JSONB document ({ seo, sections }) validated by @ff/content (the same Zod
 * schema Astro renders from) before every save. Publishing flips the live
 * version and fires the rebuild webhook.
 *
 * Editing is field-by-field (no JSON, no code) via a generic schema-agnostic
 * <FieldEditor>. A non-blocking voice check nudges copy toward the guide.
 */
export function SiteContent() {
  const qc = useQueryClient();
  const [slug, setSlug] = useState<string | null>(null);

  const { data: pages = [], isPending } = useQuery({
    queryKey: ["content-pages"],
    queryFn: listContentPages,
  });

  const activeSlug = slug ?? pages[0]?.slug ?? null;

  const newPage = useMutation({
    mutationFn: (s: string) => createPageVersion(s, "marketing", emptyPage(s)),
    onSuccess: async (_id, s) => { await qc.invalidateQueries({ queryKey: ["content-pages"] }); setSlug(s); },
  });

  function addPage() {
    const raw = window.prompt("New page path (e.g. /pricing):", "/");
    if (!raw) return;
    const s = raw.trim().startsWith("/") ? raw.trim() : `/${raw.trim()}`;
    if (pages.some((p) => p.slug === s)) { window.alert(`A page already exists at ${s}.`); return; }
    newPage.mutate(s);
  }

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · site content</div>
      <h1 className="page-title">Site content.</h1>
      <p className="page-sub">
        Edit the published copy of every page. Change it once here → the website rebuilds and
        every surface (and matching emails) reflects it. On-voice, versioned, audited.
      </p>

      <ContentSubnav active="site" />

      {isPending ? (
        <div className="empty">Loading…</div>
      ) : pages.length === 0 ? (
        <div className="alert" style={{ marginTop: 16 }}>
          <IconAlert size={16} />
          <span>No content pages yet. Once the content migration is applied and the homepage is
          seeded, pages appear here to edit.</span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0", alignItems: "center" }}>
          {pages.map((p) => (
            <button
              key={p.slug}
              className={`tab ${p.slug === activeSlug ? "active" : ""}`}
              onClick={() => setSlug(p.slug)}
            >
              {p.slug} {p.is_live ? "● live" : ""}
            </button>
          ))}
          <button className="btn-link" onClick={addPage} disabled={newPage.isPending}>
            {newPage.isPending ? "Creating…" : "+ New page"}
          </button>
        </div>
      )}
      {pages.length === 0 && (
        <button className="btn" style={{ marginTop: 16 }} onClick={addPage} disabled={newPage.isPending}>
          {newPage.isPending ? "Creating…" : "+ New page"}
        </button>
      )}

      {activeSlug && <PageEditor key={activeSlug} slug={activeSlug} onChanged={() => qc.invalidateQueries({ queryKey: ["content-pages"] })} />}
    </div>
  );
}

function PageEditor({ slug, onChanged }: { slug: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<unknown>(null);
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [addType, setAddType] = useState<(typeof SECTION_TYPES)[number]>("features");

  const { data: rows = [], isPending } = useQuery({
    queryKey: ["page-versions", slug],
    queryFn: () => listPageVersions(slug),
  });

  const seededId = selectedId ?? (rows.find((r) => r.is_live) ?? rows[0])?.id ?? null;
  const selected = useMemo(() => rows.find((r) => r.id === seededId) ?? null, [rows, seededId]);

  if (!seeded && !isPending && selected) {
    setSeeded(true);
    setSelectedId(selected.id);
    setDraft(structuredClone(selected.payload));
  }

  const dirty = selected ? JSON.stringify(draft) !== JSON.stringify(selected.payload) : false;
  const voiceWarnings = useMemo(() => checkVoice(draft), [draft]);

  const saveMut = useMutation({
    mutationFn: () => {
      const parsed = Page.parse(draft); // single-source validation — same schema Astro renders
      return createPageVersion(slug, parsed.surface, parsed, notes.trim() || undefined);
    },
    onSuccess: async (newId) => {
      await qc.invalidateQueries({ queryKey: ["page-versions", slug] });
      setSelectedId(newId);
      setNotes("");
      setEditing(false);
      setFlash("Saved as a new version. Click ‘Set live’ to publish it.");
    },
    onError: (e) => setError((e as Error).message),
  });

  const liveMut = useMutation({
    mutationFn: (id: string) => setLivePage(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["page-versions", slug] });
      onChanged();
      setFlash("Published. The site rebuilds with the new content shortly.");
    },
    onError: (e) => setError((e as Error).message),
  });

  if (isPending) return <div className="empty">Loading…</div>;

  return (
    <div className="prompt-editor prompt-editor-grid">
      <aside>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Version history</div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {rows.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => { setSelectedId(r.id); setDraft(structuredClone(r.payload)); setEditing(false); }}
                style={{
                  width: "100%", textAlign: "left", padding: "10px 12px",
                  border: "1px solid var(--line)", borderColor: r.id === selectedId ? "var(--ink)" : "var(--line)",
                  background: r.id === selectedId ? "var(--paper)" : "transparent",
                  borderRadius: 8, cursor: "pointer", fontSize: "var(--fs-data-row)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>Version {r.version}</strong>
                  {r.is_live && <span style={{ fontSize: "var(--fs-tiny)", fontWeight: "var(--fw-bold)", color: "var(--income)" }}>● LIVE</span>}
                </div>
                <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 3 }}>
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}><IconAlert size={16} /> <span>{error}</span></div>}
        {flash && <div className="alert alert-success" style={{ marginBottom: 12 }}><IconCheck size={16} /> <span>{flash}</span></div>}

        <div className="voice-header">
          <div className="voice-header-meta">
            <div className="voice-header-title">Version {selected?.version ?? "?"}</div>
            <div className="voice-header-sub">
              {selected?.is_live && <span className="badge badge-live">● Live</span>}
              {!selected?.is_live && <span className="badge badge-draft">Draft — not live</span>}
              {dirty && <span className="badge badge-warn">● Unsaved changes</span>}
            </div>
          </div>
          <div className="voice-header-actions">
            {!editing && <button className="btn" onClick={() => setEditing(true)}>Edit</button>}
            {editing && (
              <>
                <button className="btn" onClick={() => { if (selected) setDraft(structuredClone(selected.payload)); setEditing(false); }} disabled={saveMut.isPending}>Cancel</button>
                <button className="btn primary" onClick={() => { setError(null); saveMut.mutate(); }} disabled={!dirty || saveMut.isPending}>
                  {saveMut.isPending ? "Saving…" : "Save as new version"}
                </button>
              </>
            )}
            {!editing && selected && !selected.is_live && (
              <button className="btn primary" onClick={() => { setError(null); liveMut.mutate(selected.id); }} disabled={liveMut.isPending}>Set live</button>
            )}
          </div>
        </div>

        {editing && voiceWarnings.length > 0 && (
          <div className="alert alert-warn" style={{ marginBottom: 12 }}>
            <IconAlert size={16} />
            <span>Voice check: {voiceWarnings.join(" · ")}. <a href="/content#voice">Open the voice guide →</a> (non-blocking)</span>
          </div>
        )}

        {draft != null && (
          editing
            ? <SectionsEditor draft={draft} onChange={setDraft} addType={addType} setAddType={setAddType} />
            : <PagePreview payload={draft} />
        )}

        {editing && (
          <input
            type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="What changed in this version? (optional)"
            style={{ width: "100%", marginTop: 12, padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: "max(16px, var(--fs-data-row))", boxSizing: "border-box" }}
          />
        )}
      </section>
    </div>
  );
}

/* Read-only preview of the page payload — a labelled summary of every section. */
function PagePreview({ payload }: { payload: unknown }) {
  const p = payload as { seo?: { title?: string }; sections?: Array<{ type: string }> };
  return (
    <div style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-2)" }}>
      <div style={{ marginBottom: 8 }}><strong>SEO title:</strong> {p.seo?.title ?? "—"}</div>
      <div><strong>Sections:</strong> {(p.sections ?? []).map((s) => s.type).join(" · ") || "—"}</div>
      <p style={{ marginTop: 10, color: "var(--ink-3)" }}>Click ‘Edit’ to change any field.</p>
    </div>
  );
}

/* ── Section-aware editor: SEO + per-section cards with reorder/delete ────── */
type PageDraft = { slug: string; surface: string; seo: unknown; sections: Array<{ type: string; position: number; data: unknown }> };

function SectionsEditor({ draft, onChange, addType, setAddType }: {
  draft: unknown;
  onChange: (v: unknown) => void;
  addType: (typeof SECTION_TYPES)[number];
  setAddType: (t: (typeof SECTION_TYPES)[number]) => void;
}) {
  const page = draft as PageDraft;
  // Persist sections, renumbering position to match array order (index.astro sorts by position).
  const commit = (sections: PageDraft["sections"]) =>
    onChange({ ...page, sections: sections.map((s, k) => ({ ...s, position: k })) });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= page.sections.length) return;
    const next = [...page.sections];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <FieldEditor label="seo" value={page.seo} onChange={(seo) => onChange({ ...page, seo })} />

      {page.sections.map((s, i) => (
        <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong style={{ textTransform: "capitalize" }}>{s.type}</strong>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="btn-link" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
              <button className="btn-link" onClick={() => move(i, 1)} disabled={i === page.sections.length - 1} aria-label="Move down" title="Move down">↓</button>
              <button className="btn-link" style={{ color: "var(--error)" }} aria-label="Delete section"
                onClick={() => { if (window.confirm(`Delete the "${s.type}" section?`)) commit(page.sections.filter((_, k) => k !== i)); }}>Delete</button>
            </div>
          </div>
          <FieldEditor value={s.data} onChange={(data) => onChange({ ...page, sections: page.sections.map((x, k) => (k === i ? { ...x, data } : x)) })} />
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--line)" }}>
        <span style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)" }}>Add section:</span>
        <select value={addType} onChange={(e) => setAddType(e.target.value as typeof addType)}
          style={{ padding: 8, border: "1px solid var(--line)", borderRadius: 8, fontSize: "max(16px, var(--fs-data-row))" }}>
          {SECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="btn" onClick={() => commit([...page.sections, emptySection(addType, page.sections.length) as PageDraft["sections"][number]])}>+ Add</button>
      </div>
    </div>
  );
}

/* ── Generic schema-agnostic field editor ──────────────────────────────────
   Renders labelled inputs for strings/numbers/booleans, repeatable rows for
   arrays, and nested fieldsets for objects — so every section type is editable
   with no per-type code and no JSON. */
function FieldEditor({ value, onChange, label }: { value: unknown; onChange: (v: unknown) => void; label?: string }) {
  if (typeof value === "string") {
    const long = value.length > 60;
    return (
      <Field label={label}>
        {long
          ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} style={inputStyle} />
          : <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />}
      </Field>
    );
  }
  if (typeof value === "number") {
    return <Field label={label}><input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} style={inputStyle} /></Field>;
  }
  if (typeof value === "boolean") {
    return <Field label={label}><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /></Field>;
  }
  if (Array.isArray(value)) {
    return (
      <Field label={label}>
        <div style={{ display: "grid", gap: 8 }}>
          {value.map((item, i) => (
            <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10, position: "relative" }}>
              <FieldEditor value={item} onChange={(v) => { const next = [...value]; next[i] = v; onChange(next); }} />
              <button className="btn-link" style={{ position: "absolute", top: 6, right: 8, fontSize: "var(--fs-tiny)" }}
                onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button className="btn" style={{ alignSelf: "start" }}
            onClick={() => onChange([...value, value.length ? structuredClone(value[0]) : ""])}>+ Add</button>
        </div>
      </Field>
    );
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (
      <fieldset style={{ border: label ? "1px solid var(--line)" : "0", borderRadius: 8, padding: label ? 12 : 0, margin: 0, display: "grid", gap: 10 }}>
        {label && <legend style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-semibold)", color: "var(--ink-3)" }}>{label}</legend>}
        {Object.entries(obj).map(([k, v]) =>
          k === "type" || k === "id"
            ? null
            : <FieldEditor key={k} label={k} value={v} onChange={(nv) => onChange({ ...obj, [k]: nv })} />)}
      </fieldset>
    );
  }
  return null;
}

function Field({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      {label && <span style={{ display: "block", fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-semibold)", color: "var(--ink-3)", marginBottom: 4, textTransform: "capitalize" }}>{label}</span>}
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8,
  fontSize: "max(16px, var(--fs-data-row))", boxSizing: "border-box", background: "var(--white)",
};

/* Lightweight, non-blocking voice heuristic. The full AI voice check (against
   the live voice guide, via the email-compose path) wires in a later step. */
const BANNED = ["revolutionary", "game-changer", "synergy", "leverage", "best-in-class", "unleash"];
function checkVoice(payload: unknown): string[] {
  const text = JSON.stringify(payload ?? "").toLowerCase();
  const hits = BANNED.filter((w) => text.includes(w));
  const out: string[] = [];
  if (hits.length) out.push(`off-voice words: ${hits.join(", ")}`);
  if ((text.match(/!/g)?.length ?? 0) > 6) out.push("lots of exclamation marks");
  return out;
}
