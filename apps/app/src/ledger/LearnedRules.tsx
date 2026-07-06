/**
 * LearnedRules — Penny's learned categorization shortcuts, and the delete path
 * (card W1.6). As a human categorizes, `recategorize_entry` learns a rule so the
 * same kind of transaction is handled automatically next time. This surface lets
 * an owner (via Advanced → Rules) or a full-access CPA (Categorize → Rules) SEE
 * every learned rule — pattern · target account · learned-from · hit count — and
 * DELETE a bad one. A read-only CPA sees the list but gets no delete affordance.
 *
 * Delete = 3 taps (Categorize/Advanced → Rules → Delete + confirm). Deleting
 * (soft-deactivating) a rule stops Penny proposing from it on the next categorize,
 * because the matcher filters is_active. Every delete is audit-logged in the
 * deactivate_categorization_rule RPC and gated by can_write_org_as there too.
 *
 * CAT-F4 safety: match_value is rendered as LITERAL text and deleted by rule id —
 * it is never evaluated as a LIKE pattern here — so a poisoned `%`/`_`/`\` rule
 * can be seen and removed without ever being matched. The ESCAPE hardening in
 * match_categorization_rule stays authoritative for the matching path.
 */
import { useState } from "react";
import { deleteRule, useLearnedRules, useLearnedRulesRefresh, type LearnedRule } from "./api";
import { CompactEmpty } from "./CompactEmpty";
import { COPY } from "../copy";

export default function LearnedRules({ orgId, canWrite }: { orgId: string; canWrite: boolean }) {
  const q = useLearnedRules(orgId);
  const refresh = useLearnedRulesRefresh(orgId);

  if (q.isLoading) return <p className="muted">{COPY.rules.loading}</p>;
  if (q.isError) return <p className="error">{COPY.rules.loadError}</p>;

  const rules = q.data ?? [];
  if (rules.length === 0) {
    return <CompactEmpty text={COPY.rules.emptyTitle} />;
  }

  return (
    <div className="rules">
      <div className="panel-toolbar">
        <span className="muted">{COPY.rules.count(rules.length)}</span>
      </div>
      <p className="muted rules-lead">{COPY.rules.lead}</p>
      {!canWrite && <p className="muted sm">{COPY.rules.readOnlyNote}</p>}
      {/* PENNY-UX-5 — scrollable region must be keyboard-reachable (axe: scrollable-region-focusable) */}
      <div className="table-wrap" tabIndex={0} role="region" aria-label={COPY.rules.tableAria}>
        <div className="rules-head" role="row">
          <span role="columnheader">{COPY.rules.colPattern}</span>
          <span role="columnheader">{COPY.rules.colAccount}</span>
          <span role="columnheader">{COPY.rules.colLearnedFrom}</span>
          <span role="columnheader" className="rules-hits-h">{COPY.rules.colHits}</span>
          <span role="columnheader" aria-hidden="true" />
        </div>
        <ul className="rules-list">
          {rules.map((r) => (
            <RuleRow key={r.id} orgId={orgId} canWrite={canWrite} rule={r} onDeleted={refresh} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function matchLabel(t: LearnedRule["match_type"]): string {
  if (t === "description_exact") return COPY.rules.matchExact;
  if (t === "source_ref_exact") return COPY.rules.matchSourceRef;
  return COPY.rules.matchContains;
}

function RuleRow({
  orgId, canWrite, rule, onDeleted,
}: {
  orgId: string; canWrite: boolean; rule: LearnedRule; onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accountLabel = rule.account
    ? `${rule.account.code ? `${rule.account.code} · ` : ""}${rule.account.name}`
    : COPY.common.emDash;
  const learnedFrom = rule.source === "penny" ? COPY.rules.learnedFromPenny : COPY.rules.learnedFromHuman;

  async function confirmDelete() {
    setBusy(true); setErr(null);
    try {
      await deleteRule(orgId, rule.id);
      onDeleted();
      // Row disappears on refresh; no local state to clear.
    } catch (e) {
      setErr((e as Error).message || COPY.rules.deleteError);
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li className="rules-row" role="row">
      <span className="rules-pattern" role="cell">
        <span className="rules-match muted sm">{matchLabel(rule.match_type)}</span>
        {/* match_value is literal text — never a LIKE pattern here (CAT-F4). */}
        <span className="rules-value">{rule.match_value}</span>
      </span>
      <span className="rules-account" role="cell">{accountLabel}</span>
      <span className="rules-from" role="cell">{learnedFrom}</span>
      <span className="rules-hits" role="cell">{COPY.rules.hits(rule.times_applied)}</span>
      <span className="rules-action" role="cell">
        {canWrite && !confirming && (
          <button
            type="button" className="ghost sm danger"
            aria-label={COPY.rules.deleteAria(rule.match_value)}
            onClick={() => { setErr(null); setConfirming(true); }}
          >
            {COPY.rules.deleteLabel}
          </button>
        )}
      </span>

      {confirming && (
        <div className="rules-confirm" role="alertdialog" aria-label={COPY.rules.confirmTitle}>
          <p className="rules-confirm-title">{COPY.rules.confirmTitle}</p>
          <p className="muted sm">{COPY.rules.confirmBody(rule.match_value)}</p>
          <div className="rules-confirm-actions">
            <button type="button" className="ghost sm" disabled={busy} onClick={() => setConfirming(false)}>
              {COPY.rules.confirmCancel}
            </button>
            <button type="button" className="ghost sm danger" disabled={busy} onClick={confirmDelete}>
              {busy ? COPY.rules.deleting : COPY.rules.confirmDelete}
            </button>
          </div>
        </div>
      )}
      {err && <p className="error sm rules-err">{err}</p>}
    </li>
  );
}
