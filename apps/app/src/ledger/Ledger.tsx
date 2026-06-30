/**
 * Ledger workspace — the read-side books (chart of accounts, journal browser,
 * trial balance / P&L / balance sheet) plus the write actions wired to the
 * Phase 2 Edge-Function write-path. One component, used by both lenses; the
 * owner defaults to Overview ("how's my business"), the CPA to the Journal.
 *
 * Reads are RLS-scoped; every mutation is gated by `canWrite` in the UI AND
 * enforced server-side (can_write_org) — the disabled button is a courtesy, not
 * the control (ARCHITECTURE.md §1, §6).
 */
import { useMemo, useState } from "react";
import {
  approveEntry, newIdempotencyKey, postEntry, reverseEntry, setPeriod,
  upsertAccount, useAccounts, useEntries, useLedgerRefresh, usePeriods,
} from "./api";
import { balanceSheet, profitAndLoss, trialBalance } from "./reports";
import { formatMoney, formatMoneyShort, parseMoneyToMinor } from "./money";
import { ACCOUNT_TYPES } from "./types";
import ImportFlow from "../import/ImportFlow";
import Categorize from "./Categorize";
import { Takeaway } from "./Takeaway";
import type {
  AccountType, AccountingPeriod, DraftLine, JournalEntry, LedgerAccount,
} from "./types";

type Tab = "overview" | "categorize" | "accounts" | "journal" | "import" | "reports" | "periods";
const ALL_TABS: { id: Tab; label: string; writeOnly?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "categorize", label: "Categorize", writeOnly: true },
  { id: "accounts", label: "Accounts" },
  { id: "journal", label: "Journal" },
  { id: "import", label: "Import", writeOnly: true },
  { id: "reports", label: "Reports" },
  { id: "periods", label: "Periods" },
];

// Local date (en-CA → YYYY-MM-DD), not UTC — avoids a day-off near midnight/month-end.
const today = () => new Date().toLocaleDateString("en-CA");
const entryTotal = (e: JournalEntry) =>
  (e.lines ?? []).filter((l) => l.side === "D").reduce((s, l) => s + l.amount_minor, 0);

export default function Ledger({
  org, canWrite, defaultTab = "overview",
}: {
  org: { id: string; name: string };
  canWrite: boolean;
  defaultTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const tabs = ALL_TABS.filter((t) => !t.writeOnly || canWrite);
  const accounts = useAccounts(org.id);
  const entries = useEntries(org.id);
  const periods = usePeriods(org.id);
  const refresh = useLedgerRefresh(org.id);

  const loading = accounts.isLoading || entries.isLoading || periods.isLoading;
  const error = accounts.isError || entries.isError || periods.isError;

  return (
    <section className="lens ledger">
      <header className="ledger-head">
        <h1>{org.name}</h1>
        {!canWrite && (
          <span className="readonly-chip">Read-only — posting disabled</span>
        )}
      </header>

      <nav className="ledger-tabs" role="tablist" aria-label="Ledger sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`ledger-tab${tab === t.id ? " on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <p className="error">Couldn't load the books. Try again.</p>}
      {loading && !error && <p className="muted">Loading the books…</p>}

      {!loading && !error && (
        <div className="ledger-panel" role="tabpanel">
          {tab === "overview" && (
            <Overview
              entries={entries.data ?? []} accounts={accounts.data ?? []}
              canWrite={canWrite}
              onReview={() => setTab("journal")}
              onCategorize={() => setTab("categorize")}
            />
          )}
          {tab === "accounts" && (
            <Accounts
              orgId={org.id} canWrite={canWrite}
              accounts={accounts.data ?? []} entries={entries.data ?? []}
              onChange={refresh}
            />
          )}
          {tab === "journal" && (
            <Journal
              orgId={org.id} canWrite={canWrite}
              accounts={accounts.data ?? []} entries={entries.data ?? []}
              onChange={refresh}
            />
          )}
          {tab === "categorize" && canWrite && (
            <Categorize orgId={org.id} canWrite={canWrite} accounts={accounts.data ?? []} onChange={refresh} />
          )}
          {tab === "import" && canWrite && (
            <ImportFlow orgId={org.id} accounts={accounts.data ?? []} onDone={() => { refresh(); setTab("journal"); }} />
          )}
          {tab === "reports" && <Reports entries={entries.data ?? []} />}
          {tab === "periods" && (
            <Periods
              orgId={org.id} canWrite={canWrite}
              periods={periods.data ?? []} onChange={refresh}
            />
          )}
        </div>
      )}
    </section>
  );
}

// ── Overview — plain-language "how's my business" ────────────────────────────
function Overview({
  entries, accounts, canWrite, onReview, onCategorize,
}: {
  entries: JournalEntry[]; accounts: LedgerAccount[];
  canWrite: boolean; onReview: () => void; onCategorize: () => void;
}) {
  const tb = useMemo(() => trialBalance(entries), [entries]);
  const pnl = useMemo(() => profitAndLoss(entries), [entries]);
  const bs = useMemo(() => balanceSheet(entries), [entries]);
  const pending = entries.filter((e) => e.status === "pending_review").length;
  const uncategorized = useMemo(() => {
    const u = accounts.find((a) => a.code === "9999" || a.name.toLowerCase() === "uncategorized");
    if (!u) return 0;
    return entries.filter((e) => e.status === "posted" && e.source !== "reversal"
      && (e.lines ?? []).some((l) => l.account_id === u.id)).length;
  }, [entries, accounts]);
  const recent = entries.slice(0, 5);

  if (accounts.length === 0) {
    return (
      <Empty
        title="No books yet"
        body="Add your chart of accounts, then post your first entry. Penny will help fill these in once the bank feed lands."
      />
    );
  }
  return (
    <div className="overview">
      <OverviewTakeaway
        canWrite={canWrite}
        notBalanced={!tb.balanced}
        pending={pending}
        uncategorized={uncategorized}
        netIncome={pnl.netIncome}
        hasActivity={pnl.totalIncome !== 0 || pnl.totalExpense !== 0}
        onReview={onReview}
        onCategorize={onCategorize}
      />
      <div className="kpis">
        <Kpi label="Cash & assets" value={formatMoneyShort(bs.totalAssets)} />
        <Kpi label="Net income (all time)" value={formatMoneyShort(pnl.netIncome)}
          tone={pnl.netIncome >= 0 ? "good" : "bad"} />
        <Kpi label="Needs review" value={String(pending)} tone={pending ? "warn" : undefined} />
      </div>
      {!tb.balanced && (
        <p className="warn-banner">
          Heads up: the books don't balance (debits {formatMoney(tb.totalDebit)} ≠ credits{" "}
          {formatMoney(tb.totalCredit)}). Every posted entry is balanced, so this points to a
          data issue worth a look.
        </p>
      )}
      <h3 className="section-h">Latest activity</h3>
      {recent.length === 0 ? (
        <p className="muted">No entries yet.</p>
      ) : (
        <ul className="activity">
          {recent.map((e) => (
            <li key={e.id}>
              <span className="a-date">{e.entry_date}</span>
              <span className="a-memo">{e.memo ?? e.source}</span>
              <StatusPill status={e.status} />
              <span className="a-amt">{formatMoney(entryTotal(e))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value${tone ? ` t-${tone}` : ""}`}>{value}</span>
    </div>
  );
}

// The one "so what / now what" line at the top of the Overview — bias toward the
// most actionable thing first (review → categorize → health), like /admin.
function OverviewTakeaway({
  canWrite, notBalanced, pending, uncategorized, netIncome, hasActivity, onReview, onCategorize,
}: {
  canWrite: boolean; notBalanced: boolean; pending: number; uncategorized: number;
  netIncome: number; hasActivity: boolean; onReview: () => void; onCategorize: () => void;
}) {
  if (notBalanced) {
    return <Takeaway tone="watch">Your books don't balance right now — worth a look below.</Takeaway>;
  }
  if (pending > 0) {
    return (
      <Takeaway tone="watch" action={canWrite ? { label: "Review", onClick: onReview } : undefined}>
        <strong>{pending}</strong> {pending === 1 ? "entry is" : "entries are"} waiting for your approval.
      </Takeaway>
    );
  }
  if (uncategorized > 0) {
    return (
      <Takeaway tone="watch" action={canWrite ? { label: "Categorize", onClick: onCategorize } : undefined}>
        Penny has <strong>{uncategorized}</strong> {uncategorized === 1 ? "transaction" : "transactions"} ready to categorize.
      </Takeaway>
    );
  }
  if (!hasActivity) {
    return <Takeaway tone="neutral">No activity yet — import your history or post your first entry to get started.</Takeaway>;
  }
  if (netIncome < 0) {
    return (
      <Takeaway tone="watch">
        You're spending more than you're earning — net <strong>{formatMoney(netIncome)}</strong> so far.
      </Takeaway>
    );
  }
  return (
    <Takeaway tone="good">
      Net income <strong>{formatMoney(netIncome)}</strong> — your books look healthy. Nothing needs you right now.
    </Takeaway>
  );
}

// ── Accounts — chart of accounts + add ───────────────────────────────────────
function Accounts({
  orgId, canWrite, accounts, entries, onChange,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[];
  entries: JournalEntry[]; onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const balances = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      if (e.status === "pending_review") continue;
      for (const l of e.lines ?? []) {
        m.set(l.account_id, (m.get(l.account_id) ?? 0) + (l.side === "D" ? l.amount_minor : -l.amount_minor));
      }
    }
    return m;
  }, [entries]);

  const live = accounts.filter((a) => !a.is_archived);
  const groups = ACCOUNT_TYPES.map((t) => ({ type: t, rows: live.filter((a) => a.type === t) }))
    .filter((g) => g.rows.length > 0);

  // debit-normal types show net as-is; credit-normal flip sign for display
  const display = (a: LedgerAccount) => {
    const net = balances.get(a.id) ?? 0;
    return a.type === "asset" || a.type === "expense" ? net : -net;
  };

  return (
    <div className="accounts">
      <div className="panel-toolbar">
        <span className="muted">{live.length} accounts</span>
        {canWrite && (
          <button className="ghost sm" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "+ Add account"}
          </button>
        )}
      </div>
      {adding && canWrite && (
        <NewAccountForm orgId={orgId} onDone={(ok) => { setAdding(false); if (ok) onChange(); }} />
      )}
      {live.length === 0 ? (
        <Empty title="No accounts" body="Add an account to start your chart of accounts." />
      ) : (
        <div className="table-wrap">
          {groups.map((g) => (
            <div className="coa-group" key={g.type}>
              <div className="coa-type">{g.type}</div>
              {g.rows.map((a) => (
                <div className="coa-row" key={a.id}>
                  <span className="coa-code">{a.code ?? "—"}</span>
                  <span className="coa-name">{a.name}</span>
                  <span className="coa-bal">{formatMoney(display(a), a.currency)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewAccountForm({ orgId, onDone }: { orgId: string; onDone: (ok: boolean) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("expense");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      await upsertAccount({ org_id: orgId, name: name.trim(), type, code: code.trim() || null });
      onDone(true);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="ledger-form" onSubmit={submit}>
      <div className="form-row">
        <label>
          <span>Code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="1000" inputMode="numeric" />
        </label>
        <label className="grow">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cash — Checking" required />
        </label>
        <label>
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      {err && <p className="error sm">{err}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add account"}</button>
      </div>
    </form>
  );
}

// ── Journal — entry browser + new entry + reverse/approve ────────────────────
function Journal({
  orgId, canWrite, accounts, entries, onChange,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[];
  entries: JournalEntry[]; onChange: () => void;
}) {
  const [posting, setPosting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const liveAccounts = accounts.filter((a) => !a.is_archived);

  async function doReverse(e: JournalEntry) {
    setBusyId(e.id); setErr(null);
    try {
      await reverseEntry({ org_id: orgId, entry_id: e.id, idempotency_key: newIdempotencyKey() });
      onChange();
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusyId(null); }
  }
  async function doApprove(e: JournalEntry) {
    setBusyId(e.id); setErr(null);
    try { await approveEntry(orgId, e.id); onChange(); }
    catch (e2) { setErr((e2 as Error).message); } finally { setBusyId(null); }
  }

  return (
    <div className="journal">
      <div className="panel-toolbar">
        <span className="muted">{entries.length} entries</span>
        {canWrite && (
          <button className="ghost sm" onClick={() => setPosting((v) => !v)} disabled={liveAccounts.length < 2}>
            {posting ? "Cancel" : "+ New entry"}
          </button>
        )}
      </div>
      {canWrite && liveAccounts.length < 2 && (
        <p className="muted sm">Add at least two accounts before posting an entry.</p>
      )}
      {posting && canWrite && (
        <NewEntryForm
          orgId={orgId} accounts={liveAccounts}
          onDone={(ok) => { setPosting(false); if (ok) onChange(); }}
        />
      )}
      {err && <p className="error sm">{err}</p>}

      {entries.length === 0 ? (
        <Empty title="No entries yet" body="Post your first journal entry to start the books." />
      ) : (
        <ul className="je-list">
          {entries.map((e) => {
            const isOpen = open === e.id;
            const reversal = Boolean(e.reverses_id);
            return (
              <li key={e.id} className={`je${e.status === "reversed" ? " is-reversed" : ""}`}>
                <button className="je-row" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                  <span className="je-date">{e.entry_date}</span>
                  <span className="je-memo">
                    {e.memo ?? (reversal ? "Reversal" : e.source)}
                    {reversal && <span className="tag">reversal</span>}
                  </span>
                  <StatusPill status={e.status} />
                  <span className="je-amt">{formatMoney(entryTotal(e))}</span>
                  <span className="je-caret">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <div className="je-detail">
                    <div className="je-lines">
                      {(e.lines ?? []).map((l) => (
                        <div className="je-line" key={l.id}>
                          <span className="jl-acct">
                            {l.account?.code ? `${l.account.code} · ` : ""}{l.account?.name ?? "—"}
                          </span>
                          <span className={`jl-amt ${l.side === "D" ? "d" : "c"}`}>
                            {l.side === "D" ? formatMoney(l.amount_minor, l.currency) : ""}
                          </span>
                          <span className={`jl-amt ${l.side === "C" ? "c" : "d"}`}>
                            {l.side === "C" ? formatMoney(l.amount_minor, l.currency) : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                    {e.source_ref && <p className="muted sm">ref: {e.source_ref}</p>}
                    {canWrite && (
                      <div className="je-actions">
                        {e.status === "pending_review" && (
                          <button className="ghost sm" disabled={busyId === e.id} onClick={() => doApprove(e)}>
                            Approve
                          </button>
                        )}
                        {e.status === "posted" && (
                          <button className="ghost sm danger" disabled={busyId === e.id} onClick={() => doReverse(e)}>
                            {busyId === e.id ? "Reversing…" : "Reverse"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NewEntryForm({
  orgId, accounts, onDone,
}: {
  orgId: string; accounts: LedgerAccount[]; onDone: (ok: boolean) => void;
}) {
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { account_id: accounts[0]?.id ?? "", side: "D", amount: "", memo: "" },
    { account_id: accounts[1]?.id ?? accounts[0]?.id ?? "", side: "C", amount: "", memo: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parsed = lines.map((l) => parseMoneyToMinor(l.amount) ?? 0);
  const debit = lines.reduce((s, l, i) => s + (l.side === "D" ? parsed[i] : 0), 0);
  const credit = lines.reduce((s, l, i) => s + (l.side === "C" ? parsed[i] : 0), 0);
  const balanced = debit === credit && debit > 0;
  const allValid = lines.every((l, i) => l.account_id && parsed[i] > 0);

  function update(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  const addLine = () =>
    setLines((ls) => [...ls, { account_id: accounts[0]?.id ?? "", side: "D", amount: "", memo: "" }]);
  const removeLine = (i: number) => setLines((ls) => (ls.length > 2 ? ls.filter((_, j) => j !== i) : ls));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!balanced || !allValid) return;
    setBusy(true); setErr(null);
    try {
      await postEntry({
        org_id: orgId,
        entry_date: date,
        idempotency_key: newIdempotencyKey(),
        memo: memo.trim() || null,
        lines: lines.map((l, i) => ({
          account_id: l.account_id, amount_minor: parsed[i], side: l.side, memo: l.memo.trim() || null,
        })),
      });
      onDone(true);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ledger-form entry-form" onSubmit={submit}>
      <div className="form-row">
        <label>
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="grow">
          <span>Memo</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What is this entry?" />
        </label>
      </div>

      <div className="lines-head">
        <span>Account</span><span>Dr/Cr</span><span>Amount</span><span />
      </div>
      {lines.map((l, i) => (
        <div className="line-row" key={i}>
          <select value={l.account_id} onChange={(e) => update(i, { account_id: e.target.value })} aria-label="Account">
            <option value="">Select account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>
            ))}
          </select>
          <select value={l.side} onChange={(e) => update(i, { side: e.target.value as "D" | "C" })} aria-label="Debit or credit">
            <option value="D">Debit</option>
            <option value="C">Credit</option>
          </select>
          <input
            inputMode="decimal" value={l.amount} aria-label="Amount"
            onChange={(e) => update(i, { amount: e.target.value })} placeholder="0.00"
          />
          <button type="button" className="line-del" onClick={() => removeLine(i)}
            disabled={lines.length <= 2} aria-label="Remove line">×</button>
        </div>
      ))}

      <div className="entry-foot">
        <button type="button" className="ghost sm" onClick={addLine}>+ Add line</button>
        <span className={`balance-indicator ${balanced ? "ok" : "off"}`}>
          Dr {formatMoney(debit)} · Cr {formatMoney(credit)}
          {balanced ? " · balanced" : " · not balanced"}
        </span>
      </div>
      {err && <p className="error sm">{err}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy || !balanced || !allValid}>
          {busy ? "Posting…" : "Post entry"}
        </button>
      </div>
    </form>
  );
}

// ── Reports — trial balance / P&L / balance sheet ────────────────────────────
function Reports({ entries }: { entries: JournalEntry[] }) {
  const [view, setView] = useState<"tb" | "pnl" | "bs">("pnl");
  return (
    <div className="reports">
      <div className="seg report-seg">
        <button className={view === "pnl" ? "on" : ""} onClick={() => setView("pnl")}>P&amp;L</button>
        <button className={view === "tb" ? "on" : ""} onClick={() => setView("tb")}>Trial balance</button>
        <button className={view === "bs" ? "on" : ""} onClick={() => setView("bs")}>Balance sheet</button>
      </div>
      {view === "pnl" && <PnlReport entries={entries} />}
      {view === "tb" && <TrialBalanceReport entries={entries} />}
      {view === "bs" && <BalanceSheetReport entries={entries} />}
    </div>
  );
}

function PnlReport({ entries }: { entries: JournalEntry[] }) {
  const p = useMemo(() => profitAndLoss(entries), [entries]);
  if (p.income.length === 0 && p.expense.length === 0) {
    return <Empty title="Nothing to report yet" body="Post income and expense entries to see your P&L." />;
  }
  return (
    <div className="report">
      <ReportSection title="Revenue" rows={p.income.map((r) => ({ label: r.name, value: formatMoney(r.amount) }))}
        total={{ label: "Total revenue", value: formatMoney(p.totalIncome) }} />
      <ReportSection title="Expenses" rows={p.expense.map((r) => ({ label: r.name, value: `(${formatMoney(r.amount)})` }))}
        total={{ label: "Total expenses", value: `(${formatMoney(p.totalExpense)})` }} />
      <div className="report-net">
        <span>Net income</span>
        <span className={p.netIncome >= 0 ? "t-good" : "t-bad"}>
          {p.netIncome >= 0 ? formatMoney(p.netIncome) : `(${formatMoney(-p.netIncome)})`}
        </span>
      </div>
    </div>
  );
}

function TrialBalanceReport({ entries }: { entries: JournalEntry[] }) {
  const tb = useMemo(() => trialBalance(entries), [entries]);
  if (tb.rows.length === 0) return <Empty title="No balances yet" body="Post entries to see the trial balance." />;
  return (
    <div className="report">
      <div className="report-table tb">
        <div className="report-head"><span>Account</span><span>Debit</span><span>Credit</span></div>
        {tb.rows.map((r) => (
          <div className="report-row" key={r.account_id}>
            <span className="r-name">{r.code ? `${r.code} · ` : ""}{r.name}</span>
            <span className="r-num">{r.net >= 0 ? formatMoney(r.net) : ""}</span>
            <span className="r-num">{r.net < 0 ? formatMoney(-r.net) : ""}</span>
          </div>
        ))}
        <div className="report-row totals">
          <span>Totals</span>
          <span className="r-num">{formatMoney(tb.totalDebit)}</span>
          <span className="r-num">{formatMoney(tb.totalCredit)}</span>
        </div>
      </div>
      {!tb.balanced && <p className="error sm">Trial balance does not tie — debits ≠ credits.</p>}
    </div>
  );
}

function BalanceSheetReport({ entries }: { entries: JournalEntry[] }) {
  const bs = useMemo(() => balanceSheet(entries), [entries]);
  const empty = bs.assets.length === 0 && bs.liabilities.length === 0 && bs.equity.length === 0;
  if (empty && bs.currentEarnings === 0) {
    return <Empty title="Nothing on the balance sheet yet" body="Post entries to see assets, liabilities, and equity." />;
  }
  return (
    <div className="report">
      <ReportSection title="Assets" rows={bs.assets.map((r) => ({ label: r.name, value: formatMoney(r.amount) }))}
        total={{ label: "Total assets", value: formatMoney(bs.totalAssets) }} />
      <ReportSection title="Liabilities" rows={bs.liabilities.map((r) => ({ label: r.name, value: formatMoney(r.amount) }))}
        total={{ label: "Total liabilities", value: formatMoney(bs.totalLiabilities) }} />
      <ReportSection
        title="Equity"
        rows={[
          ...bs.equity.map((r) => ({ label: r.name, value: formatMoney(r.amount) })),
          { label: "Current earnings", value: formatMoney(bs.currentEarnings) },
        ]}
        total={{ label: "Total equity", value: formatMoney(bs.totalEquity + bs.currentEarnings) }}
      />
      <div className="report-net">
        <span>Assets = Liabilities + Equity</span>
        <span className={bs.balanced ? "t-good" : "t-bad"}>{bs.balanced ? "Balanced" : "Out of balance"}</span>
      </div>
    </div>
  );
}

function ReportSection({
  title, rows, total,
}: {
  title: string;
  rows: { label: string; value: string }[];
  total: { label: string; value: string };
}) {
  return (
    <div className="report-section">
      <div className="report-section-h">{title}</div>
      {rows.length === 0 ? (
        <div className="report-row"><span className="muted">None</span><span /></div>
      ) : (
        rows.map((r, i) => (
          <div className="report-row" key={i}><span className="r-name">{r.label}</span><span className="r-num">{r.value}</span></div>
        ))
      )}
      <div className="report-row subtotal"><span>{total.label}</span><span className="r-num">{total.value}</span></div>
    </div>
  );
}

// ── Periods — close / reopen ─────────────────────────────────────────────────
function Periods({
  orgId, canWrite, periods, onChange,
}: {
  orgId: string; canWrite: boolean; periods: AccountingPeriod[]; onChange: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(p: AccountingPeriod) {
    setBusyId(p.id); setErr(null);
    try {
      await setPeriod(orgId, p.id, p.status === "open" ? "close" : "reopen");
      onChange();
    } catch (e) { setErr((e as Error).message); } finally { setBusyId(null); }
  }

  if (periods.length === 0) {
    return <Empty title="No periods yet" body="Periods are created automatically the first time you post into a month." />;
  }
  return (
    <div className="periods">
      {err && <p className="error sm">{err}</p>}
      <div className="table-wrap">
        {periods.map((p) => (
          <div className="period-row" key={p.id}>
            <span className="p-range">{p.period_start} → {p.period_end}</span>
            <span className={`status-pill s-${p.status}`}>{p.status}</span>
            {canWrite && (
              <button className="ghost sm" disabled={busyId === p.id} onClick={() => toggle(p)}>
                {p.status === "open" ? "Close" : "Reopen"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: JournalEntry["status"] }) {
  return <span className={`status-pill s-${status}`}>{status.replace("_", " ")}</span>;
}
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="ledger-empty">
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </div>
  );
}
