/**
 * Invite a CPA to engage this business (owner-only; ARCHITECTURE.md §B2.2 US4).
 * Owner picks read_only vs full at invite time. Until email sending is wired, we
 * surface the accept link to copy.
 */
import { useState, type FormEvent } from "react";
import { getClient } from "../lib/supabase";

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
    const { data, error: err } = await getClient().functions.invoke("invites", {
      body: { org_id: orgId, email: email.trim(), kind: "cpa", access },
    });
    setBusy(false);
    if (err) {
      setError(err.message || "Could not send invite.");
      return;
    }
    const path = (data as { accept_path?: string } | null)?.accept_path;
    if (path) setLink(window.location.origin + path);
    setEmail("");
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
