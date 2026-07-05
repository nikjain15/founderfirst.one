/**
 * Owner control: "let this business bill and hold money in other currencies"
 * (W5.4 / docs/plans/multi-currency-design.md, decision D7 — per-org opt-in).
 * Off by default; the single-currency guard stays active for every org until
 * this flips. Owner-only — set_org_accounting_settings enforces that.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgSettings, setOrgSettings } from "../ledger/api";
import { COPY } from "../copy";

export default function MultiCurrencySetting({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const settings = useOrgSettings(orgId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const on = settings.data?.multi_currency_enabled ?? false;

  const toggle = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await setOrgSettings({ org_id: orgId, multi_currency_enabled: !on });
      await qc.invalidateQueries({ queryKey: ["org-settings", orgId] });
    } catch (err) {
      setError((err as Error).message || COPY.multiCurrency.errUpdate);
    } finally {
      setBusy(false);
    }
  };

  if (settings.isLoading || !settings.data) return null;

  return (
    <div className="approval-setting">
      <h3>{COPY.multiCurrency.heading}</h3>
      <label className="approval-toggle">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={toggle}
          aria-label={COPY.multiCurrency.checkboxAria}
        />
        <span>{COPY.multiCurrency.label}</span>
      </label>
      <p className="muted">{COPY.multiCurrency.hint}</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
