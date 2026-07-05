/**
 * Per-org "require two-factor authentication" policy (SEC-1, owner control in
 * Settings → MfaRequiredSetting). Blocks THIS ORG's books (not the whole app —
 * Settings/Security stay reachable) for a member/CPA who hasn't enrolled a
 * verified factor yet. Nests inside ActiveOrgProvider; a loading/no-org state
 * simply renders through so it never fights the pages that do their own
 * loading/empty handling underneath.
 */
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveOrg } from "../org/ActiveOrgProvider";
import { useOrgSettings } from "../ledger/api";
import { useMfaFactors, orgMfaGateBlocked } from "./api";
import { COPY } from "../copy";

export default function OrgMfaGate({ children }: { children: ReactNode }) {
  const { activeOrg } = useActiveOrg();
  const settings = useOrgSettings(activeOrg?.id);
  const factors = useMfaFactors();
  const navigate = useNavigate();

  if (!activeOrg || settings.isLoading || factors.isLoading) return <>{children}</>;

  const blocked = orgMfaGateBlocked({
    mfaRequired: settings.data?.mfa_required ?? false,
    hasVerifiedFactor: Boolean(factors.data?.some((f) => f.status === "verified")),
  });
  if (!blocked) return <>{children}</>;

  return (
    <div className="empty" role="alert">
      <p className="empty-title">{COPY.security.orgRequiredTitle}</p>
      <p className="muted">{COPY.security.orgRequiredBody}</p>
      <p>
        <button type="button" onClick={() => navigate("/security")}>
          {COPY.security.orgRequiredCta}
        </button>
      </p>
    </div>
  );
}
