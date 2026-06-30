/**
 * Invite a CPA to engage this business (owner-only; ARCHITECTURE.md §B2.2 US4).
 * Owner picks read_only vs full at invite time. Until email sending is wired, we
 * surface the accept link to copy.
 */
import { useState, type FormEvent } from "react";
import { invoke } from "../ledger/api";

export default function InviteCpa({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState("");
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
      setError((err as Error).message || "Could not send invite.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="invite-cpa" onSubmit={submit}>
      <h3>Invite your accountant</h3>
      <input
        type="email"
        required
        placeholder="cpa@firm.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="seg" role="radiogroup" aria-label="Access level">
        <button type="button" className={access === "full" ? "on" : ""} aria-pressed={access === "full"} onClick={() => setAccess("full")}>
          Full access
        </button>
        <button type="button" className={access === "read_only" ? "on" : ""} aria-pressed={access === "read_only"} onClick={() => setAccess("read_only")}>
          Read-only
        </button>
      </div>
      <button type="submit" disabled={busy || !email.trim()}>
        {busy ? "Creating invite…" : "Invite CPA"}
      </button>
      {error && <p className="error">{error}</p>}
      {link && (
        <p className="invite-link">
          Invite link (send to your accountant):<br />
          <code>{link}</code>
        </p>
      )}
    </form>
  );
}
