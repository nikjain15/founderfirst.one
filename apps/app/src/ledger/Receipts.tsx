/**
 * Receipts (W3.5) — capture a receipt (photo or pasted text), let Penny parse +
 * match it to a transaction, and resolve whatever she wasn't sure about, all in
 * one place inside Review (no new top-level tab, per APP_PRINCIPLES).
 *
 *   • Capture    — a photo or a paste; Penny reads vendor/amount/date and matches
 *                  it to an existing transaction (W1.1 discipline, server-side).
 *   • HIGH tier  — auto-attaches + shows in "Penny did this" (the W3.2 feed). The
 *                  capture card just confirms it's filed.
 *   • LOW tier   — a 1-tap confirm card ("is this the right transaction?").
 *   • No match   — the receipt lands in the short unmatched queue below, resolvable
 *                  in-flow (point it at a transaction, or set it aside).
 *
 * The tier decision + all confidence cutoffs live server-side (platform_config via
 * the receipts edge fn) — this component never bands a confidence itself.
 */
import { useRef, useState } from "react";
import {
  attachReceipt, captureReceipt, detachReceipt, dismissReceipt,
  useAttachedReceipts, useReceiptsRefresh, useUnmatchedReceipts,
  type CaptureResult, type Receipt, type ReceiptMatchCandidate,
} from "./api";
import type { JournalEntry } from "./types";
import { formatMoney } from "./money";
import { COPY } from "../copy";

const R = COPY.receipts;

function PaperclipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

// A photo file → base64 (strip the data-url prefix the edge fn doesn't want).
function fileToBase64(file: File): Promise<{ b64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("read_failed"));
    fr.onload = () => {
      const s = String(fr.result ?? "");
      resolve({ b64: s.slice(s.indexOf(",") + 1), mime: file.type || "image/jpeg" });
    };
    fr.readAsDataURL(file);
  });
}

export default function Receipts({
  orgId, canWrite, entries, onChange,
}: {
  orgId: string; canWrite: boolean; entries: JournalEntry[]; onChange?: () => void;
}) {
  const unmatched = useUnmatchedReceipts(orgId);
  const refresh = useReceiptsRefresh(orgId);
  const bump = () => { refresh(); onChange?.(); };

  if (!canWrite) return null;

  return (
    <section className="receipts">
      <div className="receipts-head">
        <h2 className="section-h">
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span> {R.capture}
        </h2>
        <p className="muted sm">{R.captureLead}</p>
      </div>

      <CaptureControl orgId={orgId} onDone={bump} />

      <div className="receipts-queue">
        <h3 className="section-h">{R.unmatchedTitle}</h3>
        <p className="muted sm">{R.unmatchedLead}</p>
        {unmatched.isLoading ? (
          <p className="muted">{COPY.common.loading}</p>
        ) : (unmatched.data ?? []).length === 0 ? (
          <p className="muted">{R.unmatchedEmpty}</p>
        ) : (
          <ul className="receipts-list">
            {(unmatched.data ?? []).map((r) => (
              <UnmatchedRow key={r.id} orgId={orgId} receipt={r} entries={entries} onChange={bump} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── capture: photo upload or pasted text ─────────────────────────────────────
function CaptureControl({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"idle" | "paste">("idle");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);

  async function run(fn: () => Promise<CaptureResult>) {
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await fn();
      setResult(r);
      onDone();
    } catch (e) { setErr((e as Error).message || R.captureError); }
    finally { setBusy(false); }
  }

  async function onPhoto(file: File) {
    const { b64, mime } = await fileToBase64(file);
    await run(() => captureReceipt({ org_id: orgId, capture_kind: "photo", image_base64: b64, mime }));
  }

  return (
    <div className="receipt-capture">
      <div className="receipt-capture-actions">
        <button className="ghost sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          {R.capturePhoto}
        </button>
        <button className="ghost sm" disabled={busy} onClick={() => setMode(mode === "paste" ? "idle" : "paste")}>
          {R.capturePaste}
        </button>
        <input
          ref={fileRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhoto(f); e.target.value = ""; }}
        />
      </div>

      {mode === "paste" && (
        <div className="receipt-paste">
          <textarea
            className="receipt-paste-input" rows={3} value={text}
            placeholder={R.pastePlaceholder} onChange={(e) => setText(e.target.value)}
          />
          <button
            className="cat-approve" disabled={busy || !text.trim()}
            onClick={() => void run(() => captureReceipt({ org_id: orgId, capture_kind: "text", raw_text: text }))}
          >
            {busy ? R.reading : R.capture}
          </button>
        </div>
      )}

      {busy && <p className="muted sm" role="status">{R.reading}</p>}
      {err && <p className="error sm">{err}</p>}
      {result && <CaptureOutcome orgId={orgId} result={result} onChange={onDone} onClear={() => setResult(null)} />}
    </div>
  );
}

// ── outcome: the auto-attach confirmation OR the 1-tap confirm card ──────────
function CaptureOutcome({
  orgId, result, onChange, onClear,
}: {
  orgId: string; result: CaptureResult; onChange: () => void; onClear: () => void;
}) {
  if (result.tier === "high") {
    const vendor = result.receipt.vendor ?? R.hasReceipt;
    const amount = formatMoney(Math.abs(result.receipt.amount_minor ?? 0));
    return (
      <div className="receipt-outcome ok" role="status">
        <strong>{R.attachedTitle}</strong>
        <span className="muted sm">{R.attachedLine(vendor, amount)}</span>
      </div>
    );
  }
  if (result.candidate) {
    return (
      <ConfirmCard
        orgId={orgId} receipt={result.receipt} candidate={result.candidate}
        onDone={() => { onClear(); onChange(); }}
      />
    );
  }
  // Unmatched — it's already in the queue below; nudge the owner there.
  return (
    <div className="receipt-outcome" role="status">
      <span className="muted sm">{R.unmatchedLead}</span>
    </div>
  );
}

// A low-confidence match → confirm or reject in one tap.
function ConfirmCard({
  orgId, receipt, candidate, onDone,
}: {
  orgId: string; receipt: Receipt; candidate: ReceiptMatchCandidate; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setBusy(true); setErr(null);
    try { await attachReceipt(orgId, receipt.id, candidate.entry_id); onDone(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="receipt-confirm">
      <strong>{R.confirmTitle}</strong>
      <p className="muted sm">{R.confirmLead}</p>
      <div className="receipt-candidate">
        <span className="rc-date">{candidate.entry_date ?? COPY.common.emDash}</span>
        <span className="rc-memo">{candidate.memo ?? COPY.common.emDash}</span>
        <span className="rc-amt">{candidate.amount_minor != null ? formatMoney(candidate.amount_minor) : COPY.common.emDash}</span>
      </div>
      {err && <p className="error sm">{err}</p>}
      <div className="receipt-confirm-actions">
        <button className="cat-approve" disabled={busy} onClick={() => void confirm()}>
          {busy ? R.confirming : R.confirm}
        </button>
        <button className="ghost sm" disabled={busy} onClick={onDone}>{R.notThis}</button>
      </div>
    </div>
  );
}

// ── unmatched queue row: point it at a transaction, or set it aside ──────────
function UnmatchedRow({
  orgId, receipt, entries, onChange,
}: {
  orgId: string; receipt: Receipt; entries: JournalEntry[]; onChange: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function attach(entryId: string) {
    setBusy(true); setErr(null);
    try { await attachReceipt(orgId, receipt.id, entryId); onChange(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  async function setAside() {
    setBusy(true); setErr(null);
    try { await dismissReceipt(orgId, receipt.id); onChange(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  const label = [receipt.vendor, receipt.amount_minor != null ? formatMoney(receipt.amount_minor) : null, receipt.receipt_date]
    .filter(Boolean).join(" · ") || R.hasReceipt;

  return (
    <li className="receipt-item">
      <div className="receipt-item-head">
        <span className="receipt-label">{label}</span>
        <div className="receipt-item-actions">
          <button className="ghost sm" disabled={busy} onClick={() => setPicking((v) => !v)}>{R.pickTransaction}</button>
          <button className="ghost sm" disabled={busy} onClick={() => void setAside()}>{R.dismiss}</button>
        </div>
      </div>
      {err && <p className="error sm">{err}</p>}
      {picking && (
        <ul className="receipt-picker">
          {entries.slice(0, 25).map((e) => (
            <li key={e.id}>
              <button className="receipt-pick" disabled={busy} onClick={() => void attach(e.id)}>
                <span className="rc-date">{e.entry_date}</span>
                <span className="rc-memo">{e.memo ?? e.source}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ── the transaction-row indicator (used by the Journal) ──────────────────────
export function ReceiptBadge({
  orgId, entryId, canWrite,
}: {
  orgId: string; entryId: string; canWrite: boolean;
}) {
  const attached = useAttachedReceipts(orgId);
  const refresh = useReceiptsRefresh(orgId);
  const [busy, setBusy] = useState(false);
  const receipt = attached.data?.[entryId];
  if (!receipt) return null;

  async function view() {
    const { receiptSignedUrl } = await import("./api");
    const { url } = await receiptSignedUrl(orgId, receipt!.id);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }
  async function remove() {
    setBusy(true);
    try { await detachReceipt(orgId, receipt!.id); refresh(); } finally { setBusy(false); }
  }

  return (
    <span className="receipt-badge">
      <span className="receipt-chip" title={R.hasReceipt}><PaperclipIcon /> {R.hasReceipt}</span>
      {receipt.storage_path && (
        <button className="ghost sm" onClick={() => void view()}>{R.viewReceipt}</button>
      )}
      {canWrite && (
        <button className="ghost sm" disabled={busy} onClick={() => void remove()}>
          {busy ? R.detaching : R.detach}
        </button>
      )}
    </span>
  );
}
