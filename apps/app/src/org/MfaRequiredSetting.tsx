/**
 * Owner control: "require two-factor authentication for everyone with access to
 * these books" (SEC-1). When on, the org's mfa_required gate blocks any member/
 * CPA who hasn't enrolled a verified TOTP factor. Owner-only; the server
 * (set_org_accounting_settings) enforces that — this is just the surface.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgSettings, setOrgSettings } from "../ledger/api";
import { COPY } from "../copy";

export default function MfaRequiredSetting({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const settings = useOrgSettings(orgId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const on = settings.data?.mfa_required ?? false;

  const toggle = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await setOrgSettings({ org_id: orgId, mfa_required: !on });
      await qc.invalidateQueries({ queryKey: ["org-settings", orgId] });
    } catch (err) {
      setError((err as Error).message || COPY.security.policyErrUpdate);
    } finally {
      setBusy(false);
    }
  };

  if (settings.isLoading || !settings.data) return null;

  return (
    <div className="approval-setting">
      <h3>{COPY.security.policyHeading}</h3>
      <label className="approval-toggle">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={toggle}
          aria-label={COPY.security.policyCheckboxAria}
        />
        <span>{COPY.security.policyLabel}</span>
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
