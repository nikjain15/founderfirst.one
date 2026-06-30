/**
 * Create a business or firm via the write-path `orgs` Edge Function. On success
 * the membership exists, so the new org appears in the RLS-scoped switcher; we
 * refetch and make it active. (ARCHITECTURE.md §B2.1 US1/US2/US3.)
 */
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "../ledger/api";
import { useActiveOrg, type OrgType } from "./ActiveOrgProvider";

export default function CreateOrg({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const { setActiveOrgId } = useActiveOrg();
  const [name, setName] = useState("");
  const [type, setType] = useState<OrgType>("business");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await invoke<{ org?: { id?: string } }>("orgs", { type, name: name.trim() });
      const newId = data?.org?.id;
      await qc.invalidateQueries({ queryKey: ["active-org-data"] });
      if (newId) setActiveOrgId(newId);
      setName("");
      onDone?.();
    } catch (err) {
      setError((err as Error).message || "Could not create organization.");
    } finally {
      setBusy(false);
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
