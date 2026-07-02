/**
 * Create a business or firm via the write-path `orgs` Edge Function. On success
 * the membership exists, so the new org appears in the RLS-scoped switcher; we
 * refetch and make it active. (ARCHITECTURE.md §B2.1 US1/US2/US3.)
 */
import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "../ledger/api";
import { useActiveOrg, type OrgType } from "./ActiveOrgProvider";
import { COPY } from "../copy";

// Map the function's machine error codes to plain-language messages.
function friendlyError(message: string): string {
  if (message.includes("org_limit_reached")) return COPY.org.errLimit;
  if (message.includes("bad_name")) return COPY.org.errBadName;
  if (message.includes("bad_type")) return COPY.org.errBadType;
  return message || COPY.org.errCreate;
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
      <div className="seg" role="radiogroup" aria-label={COPY.org.typeAria}>
        <button
          type="button"
          className={type === "business" ? "on" : ""}
          aria-pressed={type === "business"}
          onClick={() => setType("business")}
        >
          {COPY.org.business}
        </button>
        <button
          type="button"
          className={type === "firm" ? "on" : ""}
          aria-pressed={type === "firm"}
          onClick={() => setType("firm")}
        >
          {COPY.org.cpaPractice}
        </button>
      </div>
      <input
        type="text"
        required
        maxLength={120}
        aria-label={type === "firm" ? COPY.org.practiceNameAria : COPY.org.businessNameAria}
        placeholder={type === "firm" ? COPY.org.practiceNamePlaceholder : COPY.org.businessNamePlaceholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" disabled={busy || !name.trim()}>
        {busy ? COPY.org.creating : type === "firm" ? COPY.org.createPractice : COPY.org.createBusiness}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
