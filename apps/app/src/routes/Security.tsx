/**
 * Security (SEC-1) — personal two-factor authentication. Reached from the
 * account menu (any authenticated user, owner or CPA — this is a per-user
 * setting, not an org one; the org-level "require it" policy lives in Settings,
 * MfaRequiredSetting.tsx). Enrol/challenge/verify/unenrol run straight against
 * Supabase Auth's own factor API; recovery codes are our own data, minted once
 * and never shown again.
 */
import { useState } from "react";
import Topbar from "../components/Topbar";
import { COPY } from "../copy";
import {
  useMfaFactors, useInvalidateMfaState,
  enrollTotp, verifyEnrollment, unenrollFactor,
  generateRecoveryCodes, recoveryCodesRemaining, logSecurityEvent,
} from "../security/api";
import { useQuery } from "@tanstack/react-query";

type View = "status" | "enrolling" | "recovery-codes" | "confirm-disable";

export default function Security() {
  const factors = useMfaFactors();
  const invalidate = useInvalidateMfaState();
  const remaining = useQuery({
    queryKey: ["mfa-recovery-remaining"],
    queryFn: () => recoveryCodesRemaining().then((r) => r.remaining),
    enabled: Boolean(factors.data?.some((f) => f.status === "verified")),
  });

  const [view, setView] = useState<View>("status");
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifiedFactor = factors.data?.find((f) => f.status === "verified") ?? null;

  const startEnroll = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const enrolled = await enrollTotp();
      setPendingFactorId(enrolled.factorId);
      setQrCode(enrolled.qrCode);
      setSecret(enrolled.secret);
      setCode("");
      setView("enrolling");
    } catch {
      setError(COPY.security.enrollError);
    } finally {
      setBusy(false);
    }
  };

  const cancelEnroll = async (): Promise<void> => {
    if (pendingFactorId) await unenrollFactor(pendingFactorId).catch(() => {});
    setPendingFactorId(null);
    setView("status");
  };

  const confirmEnroll = async (): Promise<void> => {
    if (!pendingFactorId) return;
    setBusy(true);
    setError(null);
    try {
      await verifyEnrollment(pendingFactorId, code);
      await logSecurityEvent("mfa.enrolled").catch(() => {});
      const { codes } = await generateRecoveryCodes();
      setRecoveryCodes(codes);
      setView("recovery-codes");
      invalidate();
    } catch {
      setError(COPY.security.enrollFailed);
    } finally {
      setBusy(false);
    }
  };

  const finishRecoveryCodes = (): void => {
    setRecoveryCodes([]);
    setPendingFactorId(null);
    setView("status");
    void remaining.refetch();
  };

  const regenerateCodes = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { codes } = await generateRecoveryCodes();
      setRecoveryCodes(codes);
      setView("recovery-codes");
    } catch {
      setError(COPY.security.recoveryGenerateError);
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async (): Promise<void> => {
    if (!verifiedFactor) return;
    setBusy(true);
    setError(null);
    try {
      await unenrollFactor(verifiedFactor.id);
      await logSecurityEvent("mfa.disabled").catch(() => {});
      setView("status");
      invalidate();
    } catch (err) {
      setError((err as Error).message || COPY.security.loadError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell">
      <Topbar />
      <main className="workspace">
        <section className="lens security">
          <header className="ledger-head">
            <p className="eyebrow lens-eyebrow">{COPY.security.eyebrow}</p>
            <h1 className="page-title">{COPY.security.heading}</h1>
          </header>
          <p className="muted">{COPY.security.lead}</p>

          <div className="security-card">
          {factors.isLoading ? (
            <p className="muted">{COPY.common.loading}</p>
          ) : view === "status" ? (
            <div className="security-status">
              <p>{verifiedFactor ? COPY.security.statusOn : COPY.security.statusOff}</p>
              {verifiedFactor ? (
                <div className="security-actions">
                  <button type="button" className="ghost sm" disabled={busy} onClick={() => void regenerateCodes()}>
                    {COPY.security.recoveryRegenerate}
                  </button>
                  <button type="button" className="ghost sm danger" disabled={busy} onClick={() => setView("confirm-disable")}>
                    {COPY.security.disable}
                  </button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={() => void startEnroll()}>
                  {COPY.security.enable}
                </button>
              )}
              {verifiedFactor && remaining.data !== undefined && (
                <p className="muted sm">{COPY.security.recoveryCodesRemaining(remaining.data)}</p>
              )}
              {error && <p className="error">{error}</p>}
            </div>
          ) : view === "confirm-disable" ? (
            <div className="security-confirm" role="alertdialog" aria-label={COPY.security.confirmDisableTitle}>
              <p className="security-confirm-title">{COPY.security.confirmDisableTitle}</p>
              <p className="muted sm">{COPY.security.confirmDisableBody}</p>
              <div className="security-confirm-actions">
                <button type="button" className="ghost sm" disabled={busy} onClick={() => setView("status")}>
                  {COPY.common.cancel}
                </button>
                <button type="button" className="ghost sm danger" disabled={busy} onClick={() => void confirmDisable()}>
                  {busy ? COPY.security.disabling : COPY.security.confirmDisableConfirm}
                </button>
              </div>
              {error && <p className="error">{error}</p>}
            </div>
          ) : view === "enrolling" ? (
            <div className="security-enroll">
              <p className="muted sm">{COPY.security.enrollLead}</p>
              <img className="security-qr" src={qrCode} alt={COPY.security.qrAria} />
              <p className="muted sm">{COPY.security.secretLabel}</p>
              <code className="security-secret">{secret}</code>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label={COPY.security.codeAria}
                placeholder={COPY.security.codePlaceholder}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className="security-actions">
                <button type="button" className="ghost sm" disabled={busy} onClick={() => void cancelEnroll()}>
                  {COPY.security.cancelSetup}
                </button>
                <button type="button" disabled={busy || code.length < 6} onClick={() => void confirmEnroll()}>
                  {busy ? COPY.security.confirming : COPY.security.confirmCode}
                </button>
              </div>
              {error && <p className="error">{error}</p>}
            </div>
          ) : (
            <div className="security-recovery">
              <p className="security-confirm-title">{COPY.security.recoveryHeading}</p>
              <p className="muted sm">{COPY.security.recoveryLead}</p>
              <ul className="security-recovery-list">
                {recoveryCodes.map((c) => <li key={c}><code>{c}</code></li>)}
              </ul>
              <button type="button" onClick={finishRecoveryCodes}>
                {COPY.security.recoverySavedConfirm}
              </button>
            </div>
          )}
          </div>
        </section>
      </main>
    </div>
  );
}
