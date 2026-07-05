/**
 * SEC-1 — two-factor authentication data access. TOTP enrol/challenge/verify/
 * unenroll and the assurance-level check go straight through Supabase Auth's own
 * factor API (supabase.auth.mfa.*) — no schema of ours is involved, and a session
 * is elevated to aal2 the moment `verify` succeeds. Recovery codes are OUR data
 * (Supabase doesn't have them) and go through the `mfa` edge function so the
 * actor is always the JWT-verified caller, never client-trusted (LEARNINGS —
 * same discipline as org-settings and the other p_actor-first RPCs).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "../lib/supabase";
import { invoke } from "../ledger/api";

export interface MfaFactor {
  id: string;
  factorType: string;
  status: "verified" | "unverified";
}

export interface AssuranceLevel {
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
}

/** Every enrolled factor for the current user (any status). */
export function useMfaFactors() {
  return useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async (): Promise<MfaFactor[]> => {
      const { data, error } = await getClient().auth.mfa.listFactors();
      if (error) throw error;
      return (data?.totp ?? []).map((f) => ({
        id: f.id,
        factorType: f.factor_type,
        status: f.status,
      }));
    },
  });
}

export function useAssuranceLevel() {
  return useQuery({
    queryKey: ["mfa-aal"],
    queryFn: async (): Promise<AssuranceLevel> => {
      const { data, error } = await getClient().auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      return { currentLevel: data?.currentLevel ?? null, nextLevel: data?.nextLevel ?? null };
    },
  });
}

export function useInvalidateMfaState() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["mfa-factors"] });
    void qc.invalidateQueries({ queryKey: ["mfa-aal"] });
  };
}

/** Decide what the login-time gate should show, from the current assurance
 *  level alone. Pure + exported so it's unit-testable without a live session. */
export function mfaGateState(aal: AssuranceLevel | null): "ok" | "challenge" {
  if (!aal) return "ok";
  if (aal.currentLevel === "aal1" && aal.nextLevel === "aal2") return "challenge";
  return "ok";
}

/** Decide whether an org's "require two-factor" policy should block this user
 *  from the org's books. Pure + exported so it's unit-testable. */
export function orgMfaGateBlocked(opts: { mfaRequired: boolean; hasVerifiedFactor: boolean }): boolean {
  return opts.mfaRequired && !opts.hasVerifiedFactor;
}

export async function enrollTotp(): Promise<{
  factorId: string;
  qrCode: string;
  secret: string;
}> {
  const { data, error } = await getClient().auth.mfa.enroll({ factorType: "totp" });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyEnrollment(factorId: string, code: string): Promise<void> {
  const sb = getClient();
  const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId });
  if (chErr) throw chErr;
  const { error: vErr } = await sb.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (vErr) throw vErr;
}

export async function verifyChallenge(factorId: string, code: string): Promise<void> {
  const sb = getClient();
  const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId });
  if (chErr) throw chErr;
  const { error: vErr } = await sb.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (vErr) throw vErr;
}

export async function unenrollFactor(factorId: string): Promise<void> {
  const { error } = await getClient().auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

export const generateRecoveryCodes = () =>
  invoke<{ codes: string[] }>("mfa", { op: "generate_recovery_codes" });

export const recoveryCodesRemaining = () =>
  invoke<{ remaining: number }>("mfa", { op: "recovery_codes_remaining" });

export const redeemRecoveryCode = (code: string) =>
  invoke<{ ok: boolean; factorsCleared?: number }>("mfa", { op: "redeem_recovery_code", code });

export const logSecurityEvent = (
  action: "mfa.enrolled" | "mfa.disabled" | "mfa.challenge_failed",
  detail?: Record<string, unknown>,
) => invoke<{ ok: boolean }>("mfa", { op: "log_event", action, detail });
