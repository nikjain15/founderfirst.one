/**
 * The login-time step-up gate (SEC-1). Supabase Auth elevates a session's
 * assurance level only after a `mfa.verify` call — an email-OTP session alone
 * stays at aal1 for a user who has an enrolled, verified factor (nextLevel
 * aal2). This wraps the authenticated app: while a step-up is pending, nothing
 * else renders. A lost-authenticator recovery code clears the account's
 * factors server-side (mfa edge fn, Admin API) — a full reload afterward is the
 * simplest way to pick up the now-cleared factor list from a fresh session.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { COPY } from "../copy";
import {
  useAssuranceLevel, useMfaFactors, mfaGateState,
  verifyChallenge, redeemRecoveryCode, logSecurityEvent,
} from "./api";

export default function MfaChallengeGate({ children }: { children: ReactNode }) {
  const aal = useAssuranceLevel();
  const factors = useMfaFactors();
  const [mode, setMode] = useState<"code" | "recovery">("code");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (aal.isLoading || factors.isLoading) {
    return <div className="center muted">{COPY.common.loading}</div>;
  }
  if (mfaGateState(aal.data ?? null) === "ok") return <>{children}</>;

  const verifiedFactor = factors.data?.find((f) => f.status === "verified") ?? null;

  const submitCode = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!verifiedFactor) return;
    setBusy(true);
    setError(null);
    try {
      await verifyChallenge(verifiedFactor.id, value);
      window.location.reload();
    } catch {
      await logSecurityEvent("mfa.challenge_failed").catch(() => {});
      setError(COPY.security.challengeFailed);
      setBusy(false);
    }
  };

  const submitRecovery = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { ok } = await redeemRecoveryCode(value);
      if (!ok) {
        setError(COPY.security.recoveryInvalid);
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      setError(COPY.security.recoveryInvalid);
      setBusy(false);
    }
  };

  return (
    <div className="mfa-challenge-screen">
      <div className="mfa-challenge-card">
        <p className="page-title">{COPY.security.challengeHeading}</p>
        {mode === "code" ? (
          <form onSubmit={(e) => void submitCode(e)}>
            <p className="muted">{COPY.security.challengeLead}</p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              aria-label={COPY.security.codeAria}
              placeholder={COPY.security.codePlaceholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button type="submit" disabled={busy || value.length < 6}>
              {busy ? COPY.security.challengeVerifying : COPY.security.challengeSubmit}
            </button>
            {error && <p className="error">{error}</p>}
            <button
              type="button" className="ghost sm mfa-challenge-link"
              onClick={() => { setMode("recovery"); setValue(""); setError(null); }}
            >
              {COPY.security.useRecoveryCode}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void submitRecovery(e)}>
            <input
              type="text"
              autoFocus
              aria-label={COPY.security.recoveryCodeAria}
              placeholder={COPY.security.recoveryCodePlaceholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button type="submit" disabled={busy || !value}>
              {busy ? COPY.security.recoveryVerifying : COPY.security.recoverySubmit}
            </button>
            {error && <p className="error">{error}</p>}
            <button
              type="button" className="ghost sm mfa-challenge-link"
              onClick={() => { setMode("code"); setValue(""); setError(null); }}
            >
              {COPY.security.backToCode}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
