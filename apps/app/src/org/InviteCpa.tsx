/**
 * Invite a CPA to engage this business (owner-only; ARCHITECTURE.md §B2.2 US4).
 * Owner picks read_only vs full at invite time. Until email sending is wired, we
 * surface the accept link to copy.
 *
 * PENNY-UX-4: a CPA's "+ Add client" request link (/settings?invite_cpa=<email>)
 * pre-fills the email here — strictly validated, never auto-submitted. The owner
 * still reviews the address, chooses access, and sends; server authorization is
 * unchanged (owner-only `invites` fn, accept remains the only path to access).
 */
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { invoke } from "../ledger/api";
import { INVITE_CPA_PARAM, parsePrefillEmail } from "./addClientRequest";
import { COPY } from "../copy";

export default function InviteCpa({ orgId }: { orgId: string }) {
  const [params] = useSearchParams();
  const prefill = parsePrefillEmail(params.get(INVITE_CPA_PARAM));
  const [email, setEmail] = useState(prefill ?? "");
  const [access, setAccess] = useState<"read_only" | "full">("full");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const data = await invoke<{ accept_path?: string }>("invites", {
        org_id: orgId, email: email.trim(), kind: "cpa", access,
      });
      if (data?.accept_path) setLink(window.location.origin + data.accept_path);
      setEmail("");
    } catch (err) {
      setError((err as Error).message || COPY.invite.errSend);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="invite-cpa" onSubmit={submit}>
      <h3>{COPY.invite.heading}</h3>
      {prefill && (
        <p className="invite-prefill" role="note" aria-label={COPY.invite.prefillAria}>
          {COPY.invite.prefillNotice}
        </p>
      )}
      <input
        type="email"
        required
        autoComplete="email"
        aria-label={COPY.invite.emailAria}
        placeholder={COPY.invite.emailPlaceholder}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="seg" role="radiogroup" aria-label={COPY.invite.accessAria}>
        <button type="button" className={access === "full" ? "on" : ""} aria-pressed={access === "full"} onClick={() => setAccess("full")}>
          {COPY.invite.fullAccess}
        </button>
        <button type="button" className={access === "read_only" ? "on" : ""} aria-pressed={access === "read_only"} onClick={() => setAccess("read_only")}>
          {COPY.invite.readOnly}
        </button>
      </div>
      <button type="submit" disabled={busy || !email.trim()}>
        {busy ? COPY.invite.creating : COPY.invite.submit}
      </button>
      {error && <p className="error">{error}</p>}
      {link && (
        <p className="invite-link">
          {COPY.invite.linkLabel}<br />
          <code>{link}</code>
        </p>
      )}
    </form>
  );
}
