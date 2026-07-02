/**
 * plaidStateMachine — a PURE reference model of the Plaid ingestion contract that
 * the DB RPC `plaid_ingest_transactions` implements. It is the executable spec for
 * the acceptance rules (Roadmap §W2.3): idempotent add, reversal-based
 * modify/remove, replay-safety. Vitest exercises this model
 * (plaidStateMachine.test.ts); the DB pgTAP test exercises the real RPC. Keeping
 * both honest to the same rules is the point — a divergence is a bug.
 *
 * Amount convention (matches the RPC + toSignedMinor): +into bank / −out.
 */
export interface IngestTxn {
  transaction_id: string;
  amount_minor: number;
  date: string;
  pending?: boolean;
}
export interface Removed { transaction_id: string; }

/** A ledger entry the model produced. reversed=true once a reversal cancels it. */
export interface LedgerEntry {
  key: string;               // idempotency key (ext:plaid:<id> or a reversal/version key)
  txnId: string;
  amount_minor: number;
  date: string;
  reversal: boolean;         // true if this entry is itself a reversal
  reversedByKey?: string;    // set on the original when a reversal cancels it
}
export interface BankRow {
  transaction_id: string;
  amount_minor: number;
  date: string;
  state: "pending" | "posted" | "removed";
  entryKey: string | null;
  reversalKey: string | null;
}

export interface LedgerState {
  entries: Map<string, LedgerEntry>;   // by idempotency key (dedup)
  rows: Map<string, BankRow>;          // by transaction_id (idempotent store)
}

export function emptyState(): LedgerState {
  return { entries: new Map(), rows: new Map() };
}

function post(state: LedgerState, key: string, txnId: string, amount: number, date: string): void {
  if (state.entries.has(key)) return; // idempotent — a replay adds nothing
  state.entries.set(key, { key, txnId, amount_minor: amount, date, reversal: false });
}
function reverse(state: LedgerState, origKey: string, revKey: string, txnId: string, date: string): void {
  if (state.entries.has(revKey)) return; // reversal is itself idempotent
  const orig = state.entries.get(origKey);
  if (!orig || orig.reversedByKey) return;
  orig.reversedByKey = revKey;
  state.entries.set(revKey, { key: revKey, txnId, amount_minor: -orig.amount_minor, date, reversal: true });
}

/** Apply one Plaid sync page. Mirrors the RPC's add/modify/remove branches. */
export function ingest(
  state: LedgerState,
  page: { added?: IngestTxn[]; modified?: IngestTxn[]; removed?: Removed[] },
): void {
  for (const t of page.added ?? []) {
    if (state.rows.has(t.transaction_id)) continue;   // replay guard
    if (t.amount_minor === 0 || !t.date) continue;
    const key = `ext:plaid:${t.transaction_id}`;
    post(state, key, t.transaction_id, t.amount_minor, t.date);
    state.rows.set(t.transaction_id, {
      transaction_id: t.transaction_id, amount_minor: t.amount_minor, date: t.date,
      state: t.pending ? "pending" : "posted", entryKey: key, reversalKey: null,
    });
  }

  for (const t of page.modified ?? []) {
    const row = state.rows.get(t.transaction_id);
    if (!row) {   // modify-before-add → treat as add
      const key = `ext:plaid:${t.transaction_id}`;
      post(state, key, t.transaction_id, t.amount_minor, t.date);
      state.rows.set(t.transaction_id, {
        transaction_id: t.transaction_id, amount_minor: t.amount_minor, date: t.date,
        state: t.pending ? "pending" : "posted", entryKey: key, reversalKey: null,
      });
      continue;
    }
    // nothing economically changed → refresh pending only, no ledger move
    if (t.amount_minor === row.amount_minor && t.date === row.date) {
      row.state = t.pending ? "pending" : "posted";
      continue;
    }
    // amount/date changed → reverse old, post fresh under a new (versioned) key
    if (row.entryKey && !row.reversalKey) {
      const revKey = `ext:plaid:rev:${t.transaction_id}:${row.entryKey}`;
      reverse(state, row.entryKey, revKey, t.transaction_id, t.date);
      row.reversalKey = revKey;
    }
    const vKey = `ext:plaid:v:${t.transaction_id}:${t.amount_minor}:${t.date}`;
    post(state, vKey, t.transaction_id, t.amount_minor, t.date);
    row.amount_minor = t.amount_minor;
    row.date = t.date;
    row.entryKey = vKey;
    row.reversalKey = null;
    row.state = t.pending ? "pending" : "posted";
  }

  for (const r of page.removed ?? []) {
    const row = state.rows.get(r.transaction_id);
    if (!row || row.state === "removed") continue;   // idempotent remove
    if (row.entryKey && !row.reversalKey) {
      const revKey = `ext:plaid:rm:${r.transaction_id}:${row.entryKey}`;
      reverse(state, row.entryKey, revKey, r.transaction_id, row.date);
      row.reversalKey = revKey;
    }
    row.state = "removed";
  }
}

/** Net ledger effect on the bank account = sum of all non-reversed original
 *  entries + all reversal entries (a reversed original nets to 0). */
export function netAmount(state: LedgerState): number {
  let net = 0;
  for (const e of state.entries.values()) net += e.amount_minor;
  return net;
}

/** The live (non-reversed) posted amount for a transaction, or 0 if removed. */
export function liveAmountFor(state: LedgerState, txnId: string): number {
  const row = state.rows.get(txnId);
  if (!row || row.state === "removed" || !row.entryKey) return 0;
  const e = state.entries.get(row.entryKey);
  return e && !e.reversedByKey ? e.amount_minor : 0;
}
