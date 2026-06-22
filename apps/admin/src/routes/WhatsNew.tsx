/**
 * What's new — the in-app changelog. Any admin can post an update; every admin
 * sees a "N new since you last looked" marker (tracked per-browser in
 * localStorage, mirroring the Penny activity strip). The same entries feed the
 * weekly changelog-digest email.
 */
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listChangelog,
  addChangelogEntry,
  deleteChangelogEntry,
  previewWeeklyDigest,
  sendWeeklyDigest,
  lastDigestSend,
  type ChangelogEntry,
  type ChangelogKind,
  type DigestPreview,
} from "../lib/supabase";

const SEEN_KEY = "ff.admin.changelog.lastSeenAt";
const KIND_LABEL: Record<ChangelogKind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
const KINDS: ChangelogKind[] = ["new", "improved", "fixed"];

function relDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function WhatsNew({ currentEmail }: { currentEmail: string }) {
  const qc = useQueryClient();
  const me = currentEmail.toLowerCase();

  const { data: entries = [], isPending } = useQuery({
    queryKey: ["changelog"],
    queryFn: listChangelog,
  });

  const [lastSeenAt, setLastSeenAt] = useState<string>(
    () => (typeof window !== "undefined" ? window.localStorage.getItem(SEEN_KEY) ?? "" : ""),
  );

  // "New" = posted by someone else since you last marked the section seen.
  const unseen = useMemo(
    () => entries.filter((e) => (!lastSeenAt || e.created_at > lastSeenAt) && (e.created_by ?? "").toLowerCase() !== me),
    [entries, lastSeenAt, me],
  );

  function markSeen() {
    const latest = entries[0]?.created_at ?? new Date().toISOString();
    window.localStorage.setItem(SEEN_KEY, latest);
    setLastSeenAt(latest);
  }

  // ---- Composer -------------------------------------------------------------
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ChangelogKind>("new");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const addMut = useMutation({
    mutationFn: () => addChangelogEntry({ kind, title, body }),
    onSuccess: () => {
      setTitle(""); setBody(""); setKind("new"); setOpen(false); setErr(null);
      void qc.invalidateQueries({ queryKey: ["changelog"] });
    },
    onError: (e) => setErr((e as Error).message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteChangelogEntry(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["changelog"] }),
    onError: (e) => setErr((e as Error).message),
  });

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setErr("Give the update a title."); return; }
    addMut.mutate();
  }

  // ---- Weekly digest: review then send --------------------------------------
  const sevenDaysAgo = useMemo(() => Date.now() - 7 * 86_400_000, []);
  const thisWeekCount = useMemo(
    () => entries.filter((e) => new Date(e.created_at).getTime() >= sevenDaysAgo).length,
    [entries, sevenDaysAgo],
  );

  const { data: lastSend } = useQuery({ queryKey: ["changelog-last-send"], queryFn: lastDigestSend });

  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [digestMsg, setDigestMsg] = useState<string | null>(null);

  const previewMut = useMutation({
    mutationFn: previewWeeklyDigest,
    onSuccess: (d) => { setPreview(d); setDigestMsg(null); },
    onError: (e) => setDigestMsg((e as Error).message),
  });

  const sendMut = useMutation({
    mutationFn: sendWeeklyDigest,
    onSuccess: (r) => {
      setPreview(null);
      setDigestMsg(`Sent to ${r.sent} admin${r.sent === 1 ? "" : "s"}.`);
      void qc.invalidateQueries({ queryKey: ["changelog-last-send"] });
    },
    onError: (e) => setDigestMsg((e as Error).message),
  });

  function onSendDigest() {
    if (!preview) return;
    if (!confirm(`Send this week's digest to ${preview.recipientCount} admin(s)?`)) return;
    sendMut.mutate();
  }

  function onDelete(entry: ChangelogEntry) {
    if (!confirm(`Remove “${entry.title}” from What's new?`)) return;
    delMut.mutate(entry.id);
  }

  return (
    <section id="whats-new" className="docs-section whatsnew">
      <div className="docs-section-head whatsnew-head">
        <div>
          <span className="eyebrow">Updated weekly</span>
          <h2 className="docs-section-title">What&rsquo;s new</h2>
          <p className="docs-section-lede">
            What we&rsquo;ve shipped to the admin. Admins also get this as a weekly email.
          </p>
        </div>
        <div className="whatsnew-actions">
          {unseen.length > 0 && (
            <button type="button" className="btn-link whatsnew-seen" onClick={markSeen}>
              <span className="whatsnew-dot" aria-hidden /> {unseen.length} new · mark seen
            </button>
          )}
          <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "+ Add update"}
          </button>
        </div>
      </div>

      <div className="whatsnew-digest">
        <div className="whatsnew-digest-info">
          <strong>Weekly digest</strong>
          <span className="whatsnew-digest-sub">
            {thisWeekCount} update{thisWeekCount === 1 ? "" : "s"} from the last 7 days · sends to all admins, only when you click send.
          </span>
          {lastSend && (
            <span className="whatsnew-digest-last">
              Last sent {relDate(lastSend.sent_at)}
              {lastSend.sent_by ? ` by ${lastSend.sent_by}` : ""} to {lastSend.recipients} admin{lastSend.recipients === 1 ? "" : "s"}.
            </span>
          )}
        </div>
        {!preview && (
          <button
            type="button"
            className="btn"
            onClick={() => previewMut.mutate()}
            disabled={previewMut.isPending || thisWeekCount === 0}
            title={thisWeekCount === 0 ? "Nothing shipped in the last 7 days" : ""}
          >
            {previewMut.isPending ? "Loading…" : "Review & send →"}
          </button>
        )}
      </div>

      {preview && (
        <div className="whatsnew-preview">
          <div className="whatsnew-preview-head">
            <div>
              <strong>Preview</strong>
              <span className="whatsnew-digest-sub">
                Subject: “{preview.subject}” · goes to {preview.recipientCount} admin{preview.recipientCount === 1 ? "" : "s"}
              </span>
            </div>
            <button type="button" className="btn-link" onClick={() => setPreview(null)}>Cancel</button>
          </div>
          <iframe className="whatsnew-preview-frame" title="Digest preview" srcDoc={preview.html} />
          <div className="whatsnew-preview-actions">
            <button type="button" className="btn" onClick={onSendDigest} disabled={sendMut.isPending}>
              {sendMut.isPending ? "Sending…" : `Send to ${preview.recipientCount} admin${preview.recipientCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {digestMsg && <p className="whatsnew-digest-msg">{digestMsg}</p>}

      {open && (
        <form className="whatsnew-composer" onSubmit={onAdd}>
          <div className="whatsnew-composer-row">
            <select
              className="topic-select"
              value={kind}
              onChange={(e) => setKind(e.target.value as ChangelogKind)}
              aria-label="Update type"
            >
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <input
              className="whatsnew-title-input"
              placeholder="What changed? e.g. Added the How-it-works guide"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <textarea
            className="whatsnew-body-input"
            placeholder="Optional detail — what it does and who it helps."
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {err && <p className="whatsnew-err">{err}</p>}
          <div className="whatsnew-composer-actions">
            <button className="btn" type="submit" disabled={addMut.isPending}>
              {addMut.isPending ? "Posting…" : "Post update"}
            </button>
          </div>
        </form>
      )}

      {isPending ? (
        <p className="docs-section-lede">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="docs-section-lede">No updates yet. Post the first one with “+ Add update”.</p>
      ) : (
        <ol className="whatsnew-timeline">
          {entries.map((e) => {
            const isNew = (!lastSeenAt || e.created_at > lastSeenAt) && (e.created_by ?? "").toLowerCase() !== me;
            return (
              <li key={e.id} className={`whatsnew-item ${isNew ? "is-new" : ""}`}>
                <div className="whatsnew-item-head">
                  <span className={`whatsnew-kind kind-${e.kind}`}>{KIND_LABEL[e.kind]}</span>
                  <span className="whatsnew-item-title">{e.title}</span>
                  <span className="whatsnew-item-meta">{relDate(e.created_at)}</span>
                  <button
                    type="button"
                    className="link-danger whatsnew-del"
                    onClick={() => onDelete(e)}
                    aria-label="Remove update"
                  >
                    Remove
                  </button>
                </div>
                {e.body && <p className="whatsnew-item-body">{e.body}</p>}
                {e.created_by && <span className="whatsnew-item-by">by {e.created_by}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
