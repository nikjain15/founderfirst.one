/**
 * PayoutUpload (W4.1) — the payout-splitting upload surface, nested under
 * Connections (APP_PRINCIPLES: no new top-level tab; nest under an existing job).
 *
 * THE JOB (owner-facing): a Stripe/Shopify payout hits the bank as one lump
 * deposit that is really gross sales − fees − refunds. Recorded as a single
 * deposit, revenue and fees are silently wrong. This flow splits it correctly in
 * ≤3 taps: pick provider → upload the report + name the payout → confirm the
 * preview. Nothing posts until "Record this payout".
 *
 * Parsing + the split MATH live in payouts.ts (pure, unit-tested). The preview is
 * shown BEFORE posting and reconciled against the report's own net so a wrong
 * report surfaces to the owner, never a silent plug (LEARNINGS #16). Posting goes
 * through the `payouts` edge fn → post_ecommerce_payout, which is idempotent: a
 * re-upload of the same payout returns the original entry (duplicate:true) — we
 * show a clear "already imported" message instead of double-posting.
 */
import { useMemo, useState } from "react";
import { parseCsv, type ParsedCsv } from "../import/csv";
import { formatMoney } from "../ledger/money";
import { postEcommercePayout, useConnectors } from "../ledger/api";
import type { LedgerAccount } from "../ledger/types";
import { parsePayoutCsv, type ParsedPayout, type PayoutProvider } from "./payouts";
import { COPY } from "../copy";

const today = () => new Date().toLocaleDateString("en-CA");

// Providers that actually have a report parser today (registry status can list
// more as coming-soon; we only enable the ones payouts.ts can parse).
const PARSEABLE: ReadonlySet<string> = new Set(["stripe", "shopify"]);

export default function PayoutUpload({
  orgId, canWrite, accounts,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[];
}) {
  const connectors = useConnectors("commerce");
  const [provider, setProvider] = useState<PayoutProvider | null>(null);

  if (!canWrite) return <p className="muted">{COPY.payouts.disabled}</p>;

  if (!provider) {
    return (
      <div className="payout-upload">
        <p className="muted sm">{COPY.payouts.lead}</p>
        <div className="payout-providers" role="group" aria-label={COPY.payouts.pickProvider}>
          {(connectors.data ?? []).map((c) => {
            const enabled = c.status === "available" && PARSEABLE.has(c.key);
            return (
              <button
                key={c.key}
                type="button"
                className="payout-provider"
                disabled={!enabled}
                onClick={() => enabled && setProvider(c.key as PayoutProvider)}
              >
                <span className="pp-name">{c.name}</span>
                {!enabled && <span className="pp-soon">{COPY.payouts.comingSoon}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const name = (connectors.data ?? []).find((c) => c.key === provider)?.name ?? provider;
  return (
    <PayoutForm
      orgId={orgId}
      provider={provider}
      providerName={name}
      accounts={accounts.filter((a) => !a.is_archived)}
      onBack={() => setProvider(null)}
    />
  );
}

// ── exported for unit tests: the preview view-model, pure. ───────────────────
export interface PreviewLine { label: string; value: string; kind: "add" | "sub" | "net"; }

/** Build the owner-facing preview rows from a parsed payout. Pure + testable. */
export function previewLines(p: ParsedPayout): PreviewLine[] {
  const c = p.components;
  const lines: PreviewLine[] = [
    { label: COPY.payouts.rowGross, value: formatMoney(c.grossMinor, c.currency), kind: "add" },
  ];
  if (c.feesMinor > 0) lines.push({ label: COPY.payouts.rowFees, value: `−${formatMoney(c.feesMinor, c.currency)}`, kind: "sub" });
  if (c.refundsMinor > 0) lines.push({ label: COPY.payouts.rowRefunds, value: `−${formatMoney(c.refundsMinor, c.currency)}`, kind: "sub" });
  if (c.adjustMinor !== 0) {
    lines.push({
      label: COPY.payouts.rowAdjust,
      value: `${c.adjustMinor > 0 ? "+" : "−"}${formatMoney(Math.abs(c.adjustMinor), c.currency)}`,
      kind: c.adjustMinor > 0 ? "add" : "sub",
    });
  }
  lines.push({ label: COPY.payouts.rowNet, value: formatMoney(c.netMinor, c.currency), kind: "net" });
  return lines;
}

function PayoutForm({
  orgId, provider, providerName, accounts, onBack,
}: {
  orgId: string; provider: PayoutProvider; providerName: string;
  accounts: LedgerAccount[]; onBack: () => void;
}) {
  const [filename, setFilename] = useState("");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [payoutId, setPayoutId] = useState("");
  const [payoutDate, setPayoutDate] = useState(today());
  const [bankId, setBankId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ duplicate: boolean } | null>(null);

  const banks = accounts.filter((a) => a.type === "asset");

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilename(f.name);
    setErr(null);
    f.text().then((t) => setCsv(parseCsv(t))).catch(() => setErr(COPY.payouts.readFileError));
  }

  // Parse + reconcile the preview live. A parse error (missing columns, bad money)
  // is shown to the owner and blocks posting.
  const parsed = useMemo<{ p: ParsedPayout | null; error: string | null }>(() => {
    if (!csv || !payoutId || !payoutDate) return { p: null, error: null };
    try {
      const currency = accounts.find((a) => a.id === bankId)?.currency ?? "USD";
      return { p: parsePayoutCsv(provider, payoutId, payoutDate, currency, csv), error: null };
    } catch (e) {
      return { p: null, error: COPY.payouts.parseError((e as Error).message) };
    }
  }, [csv, payoutId, payoutDate, bankId, provider, accounts]);

  const canPost = Boolean(parsed.p && bankId && !busy);

  async function doPost() {
    if (!parsed.p) return;
    setBusy(true); setErr(null);
    try {
      const c = parsed.p.components;
      const r = await postEcommercePayout({
        org_id: orgId, provider, payout_id: payoutId, payout_date: payoutDate,
        bank_account_id: bankId,
        gross_minor: c.grossMinor, fees_minor: c.feesMinor,
        refunds_minor: c.refundsMinor, adjust_minor: c.adjustMinor,
        net_minor: c.netMinor, currency: c.currency,
      });
      setResult({ duplicate: r.duplicate });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="payout-upload">
        <div className="import-done">
          <h3>{result.duplicate ? COPY.payouts.duplicateTitle : COPY.payouts.doneTitle}</h3>
          <p className="muted">{result.duplicate ? COPY.payouts.duplicateBody : COPY.payouts.doneBody}</p>
          <button onClick={onBack}>{COPY.payouts.backToBooks}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="payout-upload">
      <div className="panel-toolbar">
        <button className="ghost sm" onClick={onBack}>{COPY.payouts.back}</button>
        <span className="muted">{csv ? COPY.payouts.fileSummary(csv.rows.length, filename) : COPY.payouts.uploadFor(providerName)}</span>
      </div>

      {!csv ? (
        <label className="file-drop">
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
          <span>{COPY.payouts.chooseFile}</span>
        </label>
      ) : (
        <>
          <p className="muted sm">{COPY.payouts.uploadHint}</p>
          <div className="ledger-form">
            <div className="form-row">
              <label className="grow"><span>{COPY.payouts.payoutIdLabel}</span>
                <input value={payoutId} onChange={(e) => setPayoutId(e.target.value)}
                  placeholder={COPY.payouts.payoutIdPlaceholder} aria-describedby="payout-id-hint" />
              </label>
              <label><span>{COPY.payouts.payoutDateLabel}</span>
                <input type="date" value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)} />
              </label>
              <label className="grow"><span>{COPY.payouts.bankAccountLabel}</span>
                <select value={bankId} onChange={(e) => setBankId(e.target.value)} aria-label={COPY.payouts.bankAccountLabel}>
                  <option value="">{COPY.common.selectAccount}</option>
                  {banks.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>)}
                </select>
              </label>
            </div>
            <p className="muted sm" id="payout-id-hint">{COPY.payouts.payoutIdHint}</p>
          </div>

          {parsed.error && <p className="error sm" role="alert">{parsed.error}</p>}

          {parsed.p && (
            <div className="payout-preview">
              <h3 className="section-h">{COPY.payouts.previewTitle}</h3>
              <div className="payout-split">
                {previewLines(parsed.p).map((l, i) => (
                  <div className={`ps-row ps-${l.kind}`} key={i}>
                    <span className="ps-label">{l.label}</span>
                    <span className="ps-value">{l.value}</span>
                  </div>
                ))}
              </div>
              <p className="muted sm">{COPY.payouts.rowsClassified(parsed.p.rowCount)}</p>
              {parsed.p.reconciles ? (
                <p className="payout-recon ok">{COPY.payouts.reconcilesOk}</p>
              ) : (
                <p className="payout-recon bad" role="alert">
                  {COPY.payouts.reconcilesBad(
                    formatMoney(parsed.p.components.netMinor, parsed.p.components.currency),
                    formatMoney(parsed.p.reportedNetMinor ?? 0, parsed.p.components.currency),
                  )}
                </p>
              )}
            </div>
          )}

          {err && <p className="error sm" role="alert">{err}</p>}
          <div className="form-actions">
            <button disabled={!canPost} onClick={doPost}>
              {busy ? COPY.payouts.posting : COPY.payouts.post}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
