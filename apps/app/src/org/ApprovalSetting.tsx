/**
 * Owner control: "review my accountant's entries before they hit the books"
 * (ARCHITECTURE.md §6.1, §B7). When on, a CPA's posts land pending_review and are
 * excluded from reports until the owner approves them. Owner-only; the server
 * (set_org_accounting_settings) enforces that — this is just the surface.
 *
 * [stress:cpa-scope] CPATEST-F1: without this the gate was unreachable.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgSettings, setOrgSettings } from "../ledger/api";

export default function ApprovalSetting({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const settings = useOrgSettings(orgId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const on = settings.data?.cpa_posts_require_approval ?? false;

  const toggle = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await setOrgSettings({ org_id: orgId, cpa_posts_require_approval: !on });
      await qc.invalidateQueries({ queryKey: ["org-settings", orgId] });
    } catch (err) {
      setError((err as Error).message || "Could not update setting.");
    } finally {
      setBusy(false);
    }
  };

  if (settings.isLoading || !settings.data) return null;

  return (
    <div className="approval-setting">
      <h3>Review accountant's entries</h3>
      <label className="approval-toggle">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={toggle}
          aria-label="Require my approval before my accountant's entries hit the books"
        />
        <span>
          Hold my accountant's entries for my approval before they appear in reports.
        </span>
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
