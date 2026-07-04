/**
 * PENNY-UX-4 — the CPA "+ Add client" guided flow (firm contexts only; launched
 * from the org switcher per APP_PRINCIPLES §3/§5, rendered in the same top-bar
 * panel as "+ New organization").
 *
 * Honest by construction (F4): there is NO server path that lets a firm create a
 * client org or engagement — engagements exist only when the client's owner
 * invites the CPA and the CPA accepts. So this flow produces the REQUEST that
 * starts the existing machinery: a link to the owner's own /settings
 * invite-your-accountant form, pre-filled with this CPA's email
 * (InviteCpa.tsx reads the `invite_cpa` param). Nothing here writes to the server.
 */
import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { buildClientRequestLink } from "./addClientRequest";
import { COPY } from "../copy";

type CopyState = "idle" | "link" | "message" | "failed";

export default function AddClient() {
  const { session } = useAuth();
  const [copied, setCopied] = useState<CopyState>("idle");

  const email = session?.user.email ?? "";
  const link = buildClientRequestLink(window.location.origin, email);

  const copy = async (text: string, which: Exclude<CopyState, "idle" | "failed">) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
    } catch {
      setCopied("failed");
    }
  };

  return (
    <div className="add-client">
      <h3>{COPY.addClient.heading}</h3>
      <p className="muted add-client-intro">{COPY.addClient.intro}</p>
      {!link ? (
        <p className="error" role="alert">{COPY.addClient.noEmail}</p>
      ) : (
        <>
          <p className="invite-link" aria-label={COPY.addClient.linkAria}>
            {COPY.addClient.linkLabel}<br />
            <code>{link}</code>
          </p>
          <div className="add-client-actions">
            <button type="button" onClick={() => void copy(link, "link")}>
              {copied === "link" ? COPY.addClient.copied : COPY.addClient.copyLink}
            </button>
            <button
              type="button" className="ghost"
              onClick={() => void copy(COPY.addClient.message(link, email), "message")}
            >
              {copied === "message" ? COPY.addClient.copied : COPY.addClient.copyMessage}
            </button>
          </div>
          {copied === "failed" && <p className="error" role="alert">{COPY.addClient.copyFailed}</p>}
          <p className="muted add-client-note">{COPY.addClient.notOnPennyYet}</p>
        </>
      )}
    </div>
  );
}
