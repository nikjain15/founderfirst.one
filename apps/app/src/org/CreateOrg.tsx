/**
 * Create a business or firm via the write-path `orgs` Edge Function. On success
 * the membership exists, so the new org appears in the RLS-scoped switcher; we
 * refetch and make it active. (ARCHITECTURE.md §B2.1 US1/US2/US3.)
 */
import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "../ledger/api";
import { useActiveOrg, type OrgType } from "./ActiveOrgProvider";

// Map the function's machine error codes to plain-language messages.
function friendlyError(message: string): string {
  if (message.includes("org_limit_reached")) {
    return "You've reached the limit on organizations. Contact us if you need more.";
  }
  if (message.includes("bad_name")) return "Please enter a name (up to 120 characters).";
  if (message.includes("bad_type")) return "Please choose a business or a CPA practice.";
  return message || "Could not create organization.";
}

export default function CreateOrg({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const { setActiveOrgId } = useActiveOrg();
  const [name, setName] = useState("");
  const [type, setType] = useState<OrgType>("business");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hard guard against a second submit slipping through before `busy` re-renders
  // (Enter + click, fast double-click). The server also dedupes, but this stops the
  // duplicate request leaving the client at all.
  const inFlight = useRef(false);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (inFlight.current || busy) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await invoke<{ org?: { id?: string } }>("orgs", { type, name: trimmed });
      const newId = data?.org?.id;
      await qc.invalidateQueries({ queryKey: ["active-org-data"] });
      if (newId) setActiveOrgId(newId);
      setName("");
      onDone?.();
    } catch (err) {
      setError(friendlyError((err as Error).message ?? ""));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  return (
    <form className="create-org" onSubmit={submit}>
      <div className="seg" role="radiogroup" aria-label="Organization type">
        <button
          type="button"
          className={type === "business" ? "on" : ""}
          aria-pressed={type === "business"}
          onClick={() => setType("business")}
        >
          Business
        </button>
        <button
          type="button"
          className={type === "firm" ? "on" : ""}
          aria-pressed={type === "firm"}
          onClick={() => setType("firm")}
        >
          CPA practice
        </button>
      </div>
      <input
        type="text"
        required
        maxLength={120}
        aria-label={type === "firm" ? "Practice name" : "Business name"}
        placeholder={type === "firm" ? "Your practice name" : "Your business name"}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" disabled={busy || !name.trim()}>
        {busy ? "Creating…" : type === "firm" ? "Create practice" : "Create business"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
