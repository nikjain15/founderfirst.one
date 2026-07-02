/**
 * CPA collaboration UI (card W1.5).
 *
 *  · SuggestionInbox — the OWNER's trust-tiered "needs-a-look" surface. Every
 *    pending suggestion is a MEDIUM-tier item the owner approves or declines;
 *    approving a reclass recategorizes the entry + learns a rule, approving an
 *    add-txn posts it. Nothing posts without this approval.
 *  · EntryCollab — the CPA-side affordances shown in a journal entry's detail:
 *    flag, add a note, suggest a category change. A read_only CPA gets none of
 *    these (the server refuses regardless; the UI just doesn't offer them).
 *
 * All copy comes from COPY.collab (CENTRAL-1). No string literals here.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { COPY } from "../copy";
import { formatMoney } from "./money";
import type { LedgerAccount } from "./types";
import {
  usePendingSuggestions, useEntryActivity,
  approveSuggestion, rejectSuggestion,
  flagEntry, resolveFlag, addNote, suggestReclass,
  type CpaSuggestion,
} from "./collab";

function acctLabel(accounts: LedgerAccount[], id: string | null): string {
  const a = accounts.find((x) => x.id === id);
  if (!a) return COPY.common.emDash;
  return a.code ? `${a.code} · ${a.name}` : a.name;
}

// ── Owner: the pending-suggestion inbox (needs-a-look) ───────────────────────
export function SuggestionInbox({
  orgId, accounts, onChange,
}: {
  orgId: string; accounts: LedgerAccount[]; onChange: () => void;
}) {
  const qc = useQueryClient();
  const q = usePendingSuggestions(orgId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["cpa-suggestions", orgId] });
    onChange();
  }
  async function decide(s: CpaSuggestion, approve: boolean) {
    setBusyId(s.id); setErr(null);
    try {
      if (approve) await approveSuggestion(orgId, s.id);
      else await rejectSuggestion(orgId, s.id);
      refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusyId(null); }
  }

  if (q.isLoading) return <p className="muted">{COPY.collab.inboxLoading}</p>;
  if (q.isError) return <p className="error sm">{COPY.collab.inboxError}</p>;
  const items = q.data ?? [];
  if (items.length === 0) {
    return (
      <div className="collab-inbox">
        <p className="eyebrow">{COPY.collab.inboxEyebrow}</p>
        <div className="empty">
          <h3>{COPY.collab.inboxEmptyTitle}</h3>
          <p className="muted">{COPY.collab.inboxEmptyBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="collab-inbox">
      <p className="eyebrow">{COPY.collab.inboxEyebrow}</p>
      <h3>{COPY.collab.inboxTitle}</h3>
      {err && <p className="error sm">{err}</p>}
      <ul className="sug-list">
        {items.map((s) => {
          const summary = s.kind === "reclass"
            ? COPY.collab.reclassSummary(acctLabel(accounts, s.from_account_id), acctLabel(accounts, s.to_account_id))
            : COPY.collab.addTxnSummary(s.entry_date ?? COPY.common.emDash,
                formatMoney((s.lines ?? []).filter((l) => l.side === "D").reduce((n, l) => n + l.amount_minor, 0)));
          const kindLabel = s.kind === "reclass" ? COPY.collab.kindReclass : COPY.collab.kindAddTxn;
          return (
            <li key={s.id} className="sug">
              <div className="sug-head">
                <span className="tag">{COPY.collab.tierMedium}</span>
                <span className="sug-kind">{kindLabel}</span>
              </div>
              <p className="sug-summary">{summary}</p>
              {s.note && <p className="muted sm">{s.note}</p>}
              <div className="sug-actions">
                <button className="sm" disabled={busyId === s.id} onClick={() => decide(s, true)}>
                  {busyId === s.id ? COPY.collab.approving : COPY.collab.approve}
                </button>
                <button className="ghost sm" disabled={busyId === s.id} onClick={() => decide(s, false)}>
                  {COPY.collab.reject}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── CPA: flag / note / suggest affordances on a posted entry ─────────────────
export function EntryCollab({
  orgId, entryId, fromAccountIds, accounts, onChange,
}: {
  orgId: string; entryId: string;
  fromAccountIds: string[];          // accounts on this entry that can be reclassified
  accounts: LedgerAccount[]; onChange: () => void;
}) {
  const qc = useQueryClient();
  const activity = useEntryActivity(orgId, entryId);
  const [mode, setMode] = useState<null | "note" | "suggest">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [fromId, setFromId] = useState(fromAccountIds[0] ?? "");
  const [toId, setToId] = useState("");
  const [reason, setReason] = useState("");

  const liveAccounts = accounts.filter((a) => !a.is_archived);
  const openFlag = (activity.data ?? []).find((a) => a.kind === "flag" && a.status === "open");

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["entry-activity", orgId, entryId] });
    void qc.invalidateQueries({ queryKey: ["cpa-suggestions", orgId] });
    onChange();
  }
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); setMode(null); setNoteText(""); setReason(""); setToId(""); refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="entry-collab">
      <div className="collab-bar">
        {openFlag ? (
          <button className="ghost sm" disabled={busy} onClick={() => run(() => resolveFlag(orgId, openFlag.id))}>
            {COPY.collab.unflag}
          </button>
        ) : (
          <button className="ghost sm" disabled={busy} onClick={() => run(() => flagEntry(orgId, entryId, reason || null))}>
            {COPY.collab.flag}
          </button>
        )}
        <button className="ghost sm" disabled={busy} onClick={() => setMode(mode === "note" ? null : "note")}>
          {COPY.collab.addNote}
        </button>
        {fromAccountIds.length > 0 && (
          <button className="ghost sm" disabled={busy} onClick={() => setMode(mode === "suggest" ? null : "suggest")}>
            {COPY.collab.suggestReclass}
          </button>
        )}
      </div>

      {mode === "note" && (
        <div className="collab-form">
          <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
            placeholder={COPY.collab.notePlaceholder} rows={2} />
          <button className="sm" disabled={busy || !noteText.trim()}
            onClick={() => run(() => addNote(orgId, entryId, noteText.trim()))}>
            {busy ? COPY.collab.working : COPY.collab.noteSubmit}
          </button>
        </div>
      )}

      {mode === "suggest" && (
        <div className="collab-form">
          <label>
            <span>{COPY.common.accountAria}</span>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {fromAccountIds.map((id) => (
                <option key={id} value={id}>{acctLabel(accounts, id)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{COPY.collab.suggestTo}</span>
            <select value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">{COPY.common.selectAccount}</option>
              {liveAccounts.filter((a) => a.id !== fromId).map((a) => (
                <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>
              ))}
            </select>
          </label>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={COPY.collab.suggestNotePlaceholder} />
          <button className="sm" disabled={busy || !fromId || !toId}
            onClick={() => run(() => suggestReclass(orgId, entryId, fromId, toId, reason || null))}>
            {busy ? COPY.collab.working : COPY.collab.suggestSubmit}
          </button>
        </div>
      )}

      {err && <p className="error sm">{err}</p>}

      {(activity.data ?? []).length > 0 && (
        <div className="collab-thread">
          <p className="muted sm">{COPY.collab.activityHeading}</p>
          <ul>
            {(activity.data ?? []).map((a) => (
              <li key={a.id} className={`collab-item k-${a.kind}${a.status === "open" ? " is-open" : ""}`}>
                <span className="ci-kind">{a.kind === "flag" ? COPY.collab.flagged : COPY.collab.addNote}</span>
                <span className="ci-body">{a.body ?? COPY.common.emDash}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
