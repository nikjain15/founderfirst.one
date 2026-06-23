/**
 * Settings → Emails — one hub for everything about transactional email.
 *
 *  • Templates: edit the brand (colors + sender), per-email copy (subject,
 *    preheader, heading, intro, CTA, footer), and the Signals cadence — all with
 *    a live preview that renders the real shell. The shell markup stays in code;
 *    only this data is editable, so deliverability can't be edited away.
 *  • Activity: the unified send log + delivery/open/click rates.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getEmailBrand, saveEmailBrand,
  listEmailTemplates, saveEmailTemplate,
  getEmailSettings, saveEmailSettings,
  previewEmailTemplate, getEmailActivity,
  createCustomEmail, deleteCustomEmail,
  listEmailSchedules, upsertEmailSchedule, deleteEmailSchedule, sendTestEmail,
  type EmailBrand, type EmailTemplate, type EmailSettings, type EmailSchedule,
} from "../lib/supabase";

const TABS = [
  { id: "templates", label: "Templates" },
  { id: "scheduled", label: "Scheduled" },
  { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function EmailHub() {
  const [tab, setTab] = useState<TabId>("templates");
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · settings</div>
      <h1 className="page-title">Emails.</h1>
      <p className="page-sub">
        Edit the brand, the copy, and the cadence of every email Penny sends — then watch who opens them.
      </p>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {tab === "templates" && <TemplatesView />}
        {tab === "scheduled" && <ScheduledView />}
        {tab === "activity" && <ActivityView />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Templates: brand + cadence + per-email copy, with live preview
 * ------------------------------------------------------------------ */

const COPY_FIELDS: Array<{ key: keyof EmailTemplate; label: string; area?: boolean; hint?: string }> = [
  { key: "subject",   label: "Subject",   hint: "≤45 chars, value- or number-led. {tokens} fill at send." },
  { key: "preheader", label: "Preheader", hint: "40–90 chars that extend the subject, not repeat it." },
  { key: "eyebrow",   label: "Eyebrow",   hint: "Small uppercase context line above the heading." },
  { key: "heading",   label: "Heading",   hint: "One sentence that pays off the subject." },
  { key: "intro",     label: "Intro",     area: true, hint: "One line of setup. Leave blank to omit." },
  { key: "cta_label", label: "Button",    hint: "Verb + payoff, e.g. “Open Signals”." },
  { key: "footer",    label: "Footer",    area: true, hint: "Why they got it + how to stop. Muted." },
];

const BRAND_COLORS: Array<{ key: keyof EmailBrand; label: string }> = [
  { key: "ink",   label: "Ink" },
  { key: "ink2",  label: "Ink 2" },
  { key: "ink3",  label: "Ink 3" },
  { key: "ink4",  label: "Ink 4" },
  { key: "line",  label: "Line" },
  { key: "paper", label: "Paper" },
  { key: "white", label: "Card" },
  { key: "income", label: "New" },
  { key: "amber", label: "Improved" },
  { key: "error", label: "Error" },
];

export function TemplatesView() {
  const qc = useQueryClient();
  const { data: templates = [], isPending: tLoading } = useQuery({ queryKey: ["email-templates"], queryFn: listEmailTemplates });
  const { data: brand, isPending: bLoading } = useQuery({ queryKey: ["email-brand"], queryFn: getEmailBrand });
  const { data: settings, isPending: sLoading } = useQuery({ queryKey: ["email-settings"], queryFn: getEmailSettings });

  const [key, setKey] = useState<string>("");
  const [draft, setDraft] = useState<EmailTemplate | null>(null);
  const [brandDraft, setBrandDraft] = useState<EmailBrand | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<EmailSettings | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed selection + drafts once data arrives.
  const selected = useMemo(() => templates.find((t) => t.email_key === key) ?? templates[0], [templates, key]);
  useEffect(() => { if (selected && (!draft || draft.email_key !== selected.email_key)) setDraft({ ...selected }); }, [selected]); // eslint-disable-line
  useEffect(() => { if (brand && !brandDraft) setBrandDraft({ ...brand }); }, [brand]); // eslint-disable-line
  useEffect(() => { if (settings && !settingsDraft) setSettingsDraft({ ...settings }); }, [settings]); // eslint-disable-line

  // ---- Live preview (debounced) --------------------------------------------
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [previewing, setPreviewing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!draft || !brandDraft) return;
    if (timer.current) clearTimeout(timer.current);
    setPreviewing(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await previewEmailTemplate(draft.email_key, draft, brandDraft);
        setPreviewHtml(r.html); setPreviewSubject(r.subject);
      } catch (e) { setError((e as Error).message); }
      finally { setPreviewing(false); }
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [draft, brandDraft]);

  const dirty = !!(draft && selected && JSON.stringify(draft) !== JSON.stringify(selected));
  const brandDirty = !!(brandDraft && brand && JSON.stringify(brandDraft) !== JSON.stringify(brand));
  const settingsDirty = !!(settingsDraft && settings && JSON.stringify(settingsDraft) !== JSON.stringify(settings));

  const saveCopy = useMutation({
    mutationFn: () => saveEmailTemplate(draft!.email_key, draft!),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["email-templates"] }); setFlash("Copy saved."); setError(null); },
    onError: (e) => setError((e as Error).message),
  });
  const saveBrand = useMutation({
    mutationFn: () => saveEmailBrand(brandDraft!),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["email-brand"] }); setFlash("Brand saved — applies to every email."); setError(null); },
    onError: (e) => setError((e as Error).message),
  });
  const saveSettings = useMutation({
    mutationFn: () => saveEmailSettings(settingsDraft!),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["email-settings"] }); setFlash("Cadence saved."); setError(null); },
    onError: (e) => setError((e as Error).message),
  });

  function resetCopy() {
    if (selected) setDraft({ ...selected });
  }

  if (tLoading || bLoading || sLoading) return <div className="empty">Loading…</div>;
  if (!draft || !brandDraft || !settingsDraft) return <div className="empty">Loading…</div>;

  return (
    <div className="email-editor">
      {error && <div className="alert alert-error">{error}</div>}
      {flash && <div className="alert alert-success">{flash}</div>}

      {/* Brand + cadence — global, affect every email */}
      <details className="email-card">
        <summary><strong>Brand &amp; cadence</strong><span className="email-sub"> — colors and the Signals threshold, shared by all emails</span></summary>
        <div className="email-brand-grid">
          <label className="field email-sender">
            <span>Sender name</span>
            <input value={brandDraft.sender_name} onChange={(e) => setBrandDraft({ ...brandDraft, sender_name: e.target.value })} />
          </label>
          {BRAND_COLORS.map((c) => (
            <label key={c.key} className="email-color">
              <span>{c.label}</span>
              <span className="email-color-row">
                <input type="color" value={String(brandDraft[c.key])} onChange={(e) => setBrandDraft({ ...brandDraft, [c.key]: e.target.value })} />
                <input className="email-hex" value={String(brandDraft[c.key])} onChange={(e) => setBrandDraft({ ...brandDraft, [c.key]: e.target.value })} />
              </span>
            </label>
          ))}
        </div>
        <div className="email-cadence">
          <label className="field">
            <span>Signals: minimum intent to send (0–100)</span>
            <input type="number" min={0} max={100} value={settingsDraft.signals_intent_min}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, signals_intent_min: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Signals: send-anyway floor (days)</span>
            <input type="number" min={1} max={60} value={settingsDraft.signals_floor_days}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, signals_floor_days: Number(e.target.value) })} />
          </label>
        </div>
        <div className="email-actions">
          <button className="btn" disabled={!brandDirty || saveBrand.isPending} onClick={() => saveBrand.mutate()}>
            {saveBrand.isPending ? "Saving…" : "Save brand"}
          </button>
          <button className="btn" disabled={!settingsDirty || saveSettings.isPending} onClick={() => saveSettings.mutate()}>
            {saveSettings.isPending ? "Saving…" : "Save cadence"}
          </button>
        </div>
      </details>

      {/* Per-email copy + live preview */}
      <div className="email-picker">
        {templates.map((t) => (
          <button key={t.email_key} className={`subnav-item ${t.email_key === draft.email_key ? "active" : ""}`}
            onClick={() => setKey(t.email_key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="email-cols">
        <div className="email-form">
          {COPY_FIELDS.map((f) => (
            <label key={String(f.key)} className="field">
              <span>{f.label} {f.hint && <em className="email-hint">{f.hint}</em>}</span>
              {f.area
                ? <textarea rows={2} value={String(draft[f.key] ?? "")} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                : <input value={String(draft[f.key] ?? "")} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />}
            </label>
          ))}
          <div className="email-actions">
            <button className="btn" disabled={!dirty || saveCopy.isPending} onClick={() => saveCopy.mutate()}>
              {saveCopy.isPending ? "Saving…" : "Save copy"}
            </button>
            <button className="btn-link" disabled={!dirty} onClick={resetCopy}>Discard changes</button>
          </div>
          <p className="email-help">
            Tokens like <code>{"{n}"}</code>, <code>{"{topIntent}"}</code>, <code>{"{author}"}</code> are filled with real values
            when the email sends. The frame (layout, buttons, dark-mode handling) is fixed in code so emails stay deliverable.
          </p>
        </div>

        <div className="email-preview-pane">
          <div className="email-preview-head">
            <strong>Preview</strong>
            <span className="email-sub">{previewing ? "rendering…" : `Subject: “${previewSubject}”`}</span>
          </div>
          <iframe className="email-preview-frame" title="Email preview" srcDoc={previewHtml} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Scheduled: compose a custom email + set it on a recurring schedule
 * ------------------------------------------------------------------ */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface ComposerState {
  // template
  label: string; eyebrow: string; subject: string; preheader: string;
  heading: string; body: string; cta_label: string; cta_href: string; footer: string;
  // schedule
  frequency: EmailSchedule["frequency"]; send_hour: number; send_dow: number;
  run_at: string; audience_kind: EmailSchedule["audience_kind"]; audience_list: string;
  enabled: boolean;
}

const BLANK: ComposerState = {
  label: "", eyebrow: "FounderFirst", subject: "", preheader: "",
  heading: "", body: "", cta_label: "", cta_href: "", footer: "You're getting this because you're a FounderFirst admin.",
  frequency: "weekly", send_hour: 13, send_dow: 1, run_at: "",
  audience_kind: "admins", audience_list: "", enabled: true,
};

function scheduleSummary(s: EmailSchedule): string {
  if (s.frequency === "once") return s.run_at ? `Once · ${new Date(s.run_at).toLocaleString()}` : "Once";
  if (s.frequency === "daily") return `Daily · ${String(s.send_hour).padStart(2, "0")}:00 UTC`;
  return `Weekly · ${DOW[s.send_dow ?? 1]} ${String(s.send_hour).padStart(2, "0")}:00 UTC`;
}

export function ScheduledView() {
  const qc = useQueryClient();
  const { data: templates = [] } = useQuery({ queryKey: ["email-templates"], queryFn: listEmailTemplates });
  const { data: schedules = [], isPending } = useQuery({ queryKey: ["email-schedules"], queryFn: listEmailSchedules });
  const { data: brand } = useQuery({ queryKey: ["email-brand"], queryFn: getEmailBrand });

  const customByKey = useMemo(() => {
    const m = new Map<string, EmailTemplate>();
    for (const t of templates) if (t.is_custom) m.set(t.email_key, t);
    return m;
  }, [templates]);

  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openNew() { setEditKey(null); setComposer({ ...BLANK }); setFlash(null); setError(null); }
  function openEdit(s: EmailSchedule) {
    const t = customByKey.get(s.email_key);
    if (!t) return;
    setEditKey(s.email_key);
    setComposer({
      label: t.label, eyebrow: t.eyebrow, subject: t.subject, preheader: t.preheader,
      heading: t.heading, body: t.body ?? "", cta_label: t.cta_label, cta_href: s.cta_href, footer: t.footer,
      frequency: s.frequency, send_hour: s.send_hour, send_dow: s.send_dow ?? 1,
      run_at: s.run_at ? s.run_at.slice(0, 16) : "", audience_kind: s.audience_kind,
      audience_list: (s.audience_list ?? []).join(", "), enabled: s.enabled,
    });
    setFlash(null); setError(null);
  }

  // ---- Live preview ---------------------------------------------------------
  const [previewHtml, setPreviewHtml] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!composer) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await previewEmailTemplate(editKey ?? "custom_preview", {
          eyebrow: composer.eyebrow, subject: composer.subject, preheader: composer.preheader,
          heading: composer.heading, intro: "", body: composer.body, cta_label: composer.cta_label, footer: composer.footer,
        }, (brand ?? {}) as Partial<EmailBrand>);
        setPreviewHtml(r.html);
      } catch (e) { setError((e as Error).message); }
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [composer, editKey, brand]);

  function parseAudience(raw: string): string[] {
    return raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const c = composer!;
      if (!c.label.trim()) throw new Error("Give the email a name.");
      if (!c.subject.trim() || !c.heading.trim()) throw new Error("Subject and heading are required.");
      const list = c.audience_kind === "list" ? parseAudience(c.audience_list) : [];
      if (c.audience_kind === "list") {
        if (!list.length) throw new Error("Add at least one recipient address.");
        const bad = list.filter((e) => !EMAIL_RE.test(e));
        if (bad.length) throw new Error(`Invalid address: ${bad[0]}`);
        if (list.length > 200) throw new Error("Max 200 recipients per email.");
      }
      const tplFields = {
        label: c.label.trim(), eyebrow: c.eyebrow, subject: c.subject, preheader: c.preheader,
        heading: c.heading, body: c.body, cta_label: c.cta_label, footer: c.footer,
      };
      const key = editKey ?? await createCustomEmail(tplFields);
      if (editKey) await saveEmailTemplate(editKey, tplFields);

      const existing = schedules.find((s) => s.email_key === key);
      await upsertEmailSchedule({
        id: existing?.id, email_key: key, frequency: c.frequency,
        send_hour: c.send_hour, send_dow: c.frequency === "weekly" ? c.send_dow : null,
        run_at: c.frequency === "once" && c.run_at ? new Date(c.run_at).toISOString() : null,
        audience_kind: c.audience_kind, audience_list: list, cta_href: c.cta_href, enabled: c.enabled,
      });
      return key;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["email-schedules"] });
      await qc.invalidateQueries({ queryKey: ["email-templates"] });
      setComposer(null); setEditKey(null); setFlash("Saved.");
    },
    onError: (e) => setError((e as Error).message),
  });

  const toggleMut = useMutation({
    mutationFn: (s: EmailSchedule) => upsertEmailSchedule({ id: s.id, email_key: s.email_key, enabled: !s.enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["email-schedules"] }),
    onError: (e) => setError((e as Error).message),
  });

  const delMut = useMutation({
    mutationFn: async (s: EmailSchedule) => { await deleteEmailSchedule(s.id); await deleteCustomEmail(s.email_key); },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["email-schedules"] }); await qc.invalidateQueries({ queryKey: ["email-templates"] }); },
    onError: (e) => setError((e as Error).message),
  });

  const testMut = useMutation({
    mutationFn: (key: string) => sendTestEmail(key),
    onSuccess: () => setFlash("Test sent to your inbox."),
    onError: (e) => setError((e as Error).message),
  });

  function onDelete(s: EmailSchedule) {
    const t = customByKey.get(s.email_key);
    if (!confirm(`Delete “${t?.label ?? s.email_key}” and its schedule? This can't be undone.`)) return;
    delMut.mutate(s);
  }

  const c = composer;
  return (
    <div className="email-scheduled">
      {error && <div className="alert alert-error">{error}</div>}
      {flash && <div className="alert alert-success">{flash}</div>}

      {!c && (
        <>
          <div className="email-actions" style={{ marginBottom: 16 }}>
            <button className="btn" onClick={openNew}>+ New scheduled email</button>
          </div>
          {isPending ? <div className="empty">Loading…</div>
            : schedules.length === 0 ? (
              <div className="empty">
                <p className="empty-title">No scheduled emails yet.</p>
                Compose a custom email and set it on a daily, weekly, or one-time schedule.
              </div>
            ) : (
              <div className="email-sched-list">
                {schedules.map((s) => {
                  const t = customByKey.get(s.email_key);
                  return (
                    <div key={s.id} className="email-sched-card">
                      <div className="email-sched-main">
                        <strong>{t?.label ?? s.email_key}</strong>
                        <span className="email-sub">{scheduleSummary(s)} · {s.audience_kind === "admins" ? "all admins" : `${s.audience_list.length} recipient${s.audience_list.length === 1 ? "" : "s"}`}</span>
                        {s.last_run_at && <span className="email-sched-last">Last sent {relTime(s.last_run_at)}</span>}
                      </div>
                      <div className="email-sched-controls">
                        <span className={`email-badge ${s.enabled ? "email-badge-open" : "email-badge-muted"}`}>{s.enabled ? "on" : "off"}</span>
                        <button className="btn-link" onClick={() => testMut.mutate(s.email_key)} disabled={testMut.isPending}>Send test</button>
                        <button className="btn-link" onClick={() => toggleMut.mutate(s)}>{s.enabled ? "Pause" : "Resume"}</button>
                        <button className="btn-link" onClick={() => openEdit(s)}>Edit</button>
                        <button className="btn-link link-danger" onClick={() => onDelete(s)}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </>
      )}

      {c && (
        <div className="email-cols">
          <div className="email-form">
            <h3 className="email-form-title">{editKey ? "Edit email" : "New scheduled email"}</h3>
            <label className="field"><span>Name (internal)</span>
              <input value={c.label} onChange={(e) => setComposer({ ...c, label: e.target.value })} /></label>
            <label className="field"><span>Eyebrow</span>
              <input value={c.eyebrow} onChange={(e) => setComposer({ ...c, eyebrow: e.target.value })} /></label>
            <label className="field"><span>Subject</span>
              <input value={c.subject} onChange={(e) => setComposer({ ...c, subject: e.target.value })} /></label>
            <label className="field"><span>Preheader</span>
              <input value={c.preheader} onChange={(e) => setComposer({ ...c, preheader: e.target.value })} /></label>
            <label className="field"><span>Heading</span>
              <input value={c.heading} onChange={(e) => setComposer({ ...c, heading: e.target.value })} /></label>
            <label className="field"><span>Body <em className="email-hint">plain text · blank line = new paragraph</em></span>
              <textarea rows={5} value={c.body} onChange={(e) => setComposer({ ...c, body: e.target.value })} /></label>
            <label className="field"><span>Button label <em className="email-hint">leave blank for no button</em></span>
              <input value={c.cta_label} onChange={(e) => setComposer({ ...c, cta_label: e.target.value })} /></label>
            <label className="field"><span>Button link</span>
              <input value={c.cta_href} onChange={(e) => setComposer({ ...c, cta_href: e.target.value })} placeholder="https://…" /></label>
            <label className="field"><span>Footer</span>
              <textarea rows={2} value={c.footer} onChange={(e) => setComposer({ ...c, footer: e.target.value })} /></label>

            <h3 className="email-form-title">Schedule</h3>
            <div className="email-cadence">
              <label className="field"><span>Frequency</span>
                <select className="topic-select" value={c.frequency} onChange={(e) => setComposer({ ...c, frequency: e.target.value as EmailSchedule["frequency"] })}>
                  <option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
                </select></label>
              {c.frequency === "once" ? (
                <label className="field"><span>When (your local time)</span>
                  <input type="datetime-local" value={c.run_at} onChange={(e) => setComposer({ ...c, run_at: e.target.value })} /></label>
              ) : (
                <label className="field"><span>Hour (UTC)</span>
                  <input type="number" min={0} max={23} value={c.send_hour} onChange={(e) => setComposer({ ...c, send_hour: Number(e.target.value) })} /></label>
              )}
              {c.frequency === "weekly" && (
                <label className="field"><span>Day</span>
                  <select className="topic-select" value={c.send_dow} onChange={(e) => setComposer({ ...c, send_dow: Number(e.target.value) })}>
                    {DOW.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select></label>
              )}
            </div>

            <h3 className="email-form-title">Audience</h3>
            <div className="email-cadence">
              <label className="field"><span>Send to</span>
                <select className="topic-select" value={c.audience_kind} onChange={(e) => setComposer({ ...c, audience_kind: e.target.value as EmailSchedule["audience_kind"] })}>
                  <option value="admins">All admins</option><option value="list">Specific addresses</option>
                </select></label>
            </div>
            {c.audience_kind === "list" && (
              <label className="field"><span>Recipients <em className="email-hint">comma- or newline-separated · max 200</em></span>
                <textarea rows={3} value={c.audience_list} onChange={(e) => setComposer({ ...c, audience_list: e.target.value })} placeholder="a@x.com, b@y.com" /></label>
            )}
            <label className="email-check">
              <input type="checkbox" checked={c.enabled} onChange={(e) => setComposer({ ...c, enabled: e.target.checked })} />
              <span>Enabled (will send on schedule)</span>
            </label>

            <div className="email-actions">
              <button className="btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
                {saveMut.isPending ? "Saving…" : editKey ? "Save changes" : "Create & schedule"}
              </button>
              <button className="btn-link" onClick={() => { setComposer(null); setEditKey(null); }}>Cancel</button>
            </div>
            <p className="email-help">
              Custom emails send from the verified FounderFirst address. The frame is the same shell as every other email,
              so they stay on-brand and deliverable. Use “Send test” after saving to check it in your own inbox.
            </p>
          </div>

          <div className="email-preview-pane">
            <div className="email-preview-head"><strong>Preview</strong></div>
            <iframe className="email-preview-frame" title="Email preview" srcDoc={previewHtml} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Activity: send log + delivery/open/click rates
 * ------------------------------------------------------------------ */

const KEY_LABEL: Record<string, string> = {
  signals_digest: "Signals digest",
  changelog_digest: "What's new",
  changelog_nudge: "What's new (nudge)",
  penny_brain: "Penny's brain",
};
const RANGES = [{ d: 7, label: "7 days" }, { d: 30, label: "30 days" }, { d: 90, label: "90 days" }];

function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const pct = (num: number, den: number) => (den === 0 ? "—" : `${Math.round((num / den) * 100)}%`);

export function ActivityView() {
  const [days, setDays] = useState(30);
  const { data, isPending, error } = useQuery({
    queryKey: ["email-activity", days],
    queryFn: () => getEmailActivity(days),
  });

  const sends = data?.sends ?? [];
  const t = data?.totals;
  const openRate = t ? pct(t.opened, t.sent) : "—";
  const clickRate = t ? pct(t.clicked, t.sent) : "—";

  return (
    <div className="email-activity">
      <div className="toolbar">
        <select className="topic-select" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Range">
          {RANGES.map((r) => <option key={r.d} value={r.d}>{r.label}</option>)}
        </select>
        <div className="toolbar-spacer" />
        <span>{sends.length} send{sends.length === 1 ? "" : "s"}</span>
      </div>

      {t && (
        <div className="email-stats">
          <div className="email-stat"><span className="email-stat-n">{t.sent}</span><span className="email-stat-l">sent</span></div>
          <div className="email-stat"><span className="email-stat-n">{openRate}</span><span className="email-stat-l">open rate</span></div>
          <div className="email-stat"><span className="email-stat-n">{clickRate}</span><span className="email-stat-l">click rate</span></div>
          <div className="email-stat"><span className="email-stat-n">{t.failed}</span><span className="email-stat-l">failed</span></div>
        </div>
      )}

      {isPending && <div className="empty">Loading…</div>}
      {error && (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <p className="empty-title">Couldn't load email activity.</p>
          {(error as Error).message}
        </div>
      )}
      {!isPending && !error && sends.length === 0 && (
        <div className="empty">
          <p className="empty-title">No sends in this window.</p>
          Emails appear here as they go out. Open/click rates fill in once Resend reports them.
        </div>
      )}

      {!isPending && !error && sends.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>when</th><th>email</th><th>subject</th>
                <th style={{ textAlign: "right" }}>to</th><th>trigger</th><th>status</th><th>engagement</th>
              </tr>
            </thead>
            <tbody>
              {sends.map((s) => (
                <tr key={s.id}>
                  <td title={new Date(s.created_at).toLocaleString()}>{relTime(s.created_at)}</td>
                  <td>{KEY_LABEL[s.email_key] ?? s.email_key}</td>
                  <td className="email-subject-cell">{s.subject}</td>
                  <td style={{ textAlign: "right" }}>{s.recipient_count}</td>
                  <td>{s.trigger}</td>
                  <td>
                    <span className={`email-badge email-badge-${s.status}`}>{s.status}</span>
                  </td>
                  <td>
                    {s.opened ? <span className="email-badge email-badge-open">opened</span>
                      : s.delivered ? <span className="email-badge email-badge-delivered">delivered</span>
                      : <span className="email-badge email-badge-muted">—</span>}
                    {s.clicked && <span className="email-badge email-badge-click">clicked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
