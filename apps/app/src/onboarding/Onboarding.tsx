/**
 * Minimal 3-step onboarding (W3.3): business name → entity type → industry.
 *
 *   Step 1  business name
 *   Step 2  entity type — tiles + labels from the entity_types kernel seed, plus a
 *           "not sure" 2-question diagnostic (questions + resolution all seed-driven)
 *   Step 3  industry — tiles from the industries kernel seed; picking one seeds the
 *           matching chart of accounts via the `onboarding` edge fn (kernel-driven,
 *           no hardcoded industry→accounts map)
 *
 * Everything else is asked IN-JOURNEY (Roadmap §W3.3, usability gate): a skippable
 * "connect a bank" offer is shown right after, routing to the Connections tab.
 * There is NO other upfront question — no payment methods, no cadence, no quiz.
 *
 * Zero hardcoded entity/industry/diagnostic lists — see kernel.ts + diagnostic.ts.
 * All copy comes from COPY.onboarding ('app' persona).
 */
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "../ledger/api";
import { useActiveOrg } from "../org/ActiveOrgProvider";
import { COPY } from "../copy";
import { useEntityTypes, useIndustries } from "./kernel";
import { buildQuiz, resolveDiagnostic, type EntityTypeSeed } from "./diagnostic";

// The wizard is exactly three steps. The "not sure" diagnostic is a sub-phase of
// step 2, not a fourth step (usability gate: no new onboarding QUESTION beyond the
// three without Nik).
const TOTAL_STEPS = 3;
// The diagnostic is a SHORT quiz — the "2-question diagnostic" per spec. The cap
// lives here (a UI choice), not in the seed logic.
const DIAGNOSTIC_MAX = 2;

type Phase = "name" | "entity" | "diagnostic" | "industry" | "done";

export default function Onboarding({ onExit }: { onExit?: () => void }) {
  const qc = useQueryClient();
  const { setActiveOrgId } = useActiveOrg();
  const entitiesQ = useEntityTypes();
  const industriesQ = useIndustries();

  const [phase, setPhase] = useState<Phase>("name");
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [entityKey, setEntityKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(0);
  const inFlight = useRef(false);

  const entities = entitiesQ.data ?? [];
  const industries = industriesQ.data ?? [];
  const stepFor: Record<Phase, number> = {
    name: 1, entity: 2, diagnostic: 2, industry: 3, done: 3,
  };

  // ── Step 1 → 2: create the org (name), then move to entity choice. ─────────
  const submitName = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (inFlight.current || busy) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await invoke<{ org?: { id?: string; name?: string } }>("orgs", {
        type: "business",
        name: trimmed,
      });
      const newId = data?.org?.id;
      if (!newId) throw new Error("no_org");
      setOrgId(newId);
      setOrgName(data?.org?.name ?? trimmed);
      setPhase("entity");
    } catch {
      setError(COPY.org.errCreate);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  // ── Step 3: stamp entity + industry and seed the CoA, then offer bank. ─────
  const finish = async (industryKey: string): Promise<void> => {
    if (inFlight.current || busy || !orgId) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await invoke<{ seeded?: number }>("onboarding", {
        org_id: orgId,
        entity_type: entityKey,
        industry_key: industryKey,
      });
      setSeeded(res?.seeded ?? 0);
      await qc.invalidateQueries({ queryKey: ["active-org-data"] });
      await qc.invalidateQueries({ queryKey: ["ledger-accounts", orgId] });
      setActiveOrgId(orgId);
      setPhase("done");
    } catch {
      setError(COPY.onboarding.errFinish);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  const goConnectBank = (): void => {
    // Land the owner in their books; the Connections tab hosts bank connect.
    if (orgId) setActiveOrgId(orgId);
    window.location.hash = "#connections";
    onExit?.();
  };
  const skip = (): void => {
    if (orgId) setActiveOrgId(orgId);
    onExit?.();
  };

  const loadError = entitiesQ.isError || industriesQ.isError;

  return (
    <div className="onboarding empty">
      <p className="eyebrow">{COPY.onboarding.stepOf(stepFor[phase], TOTAL_STEPS)}</p>

      {/* ── Step 1 — business name ── */}
      {phase === "name" && (
        <form className="onb-step" onSubmit={submitName}>
          <span className="onb-kicker">{COPY.onboarding.nameEyebrow}</span>
          <h1 className="page-title">{COPY.onboarding.nameTitle}</h1>
          <p className="muted">{COPY.onboarding.nameLead}</p>
          <input
            type="text"
            required
            maxLength={120}
            aria-label={COPY.onboarding.nameAria}
            placeholder={COPY.onboarding.namePlaceholder}
            value={name}
            onChange={(ev) => setName(ev.target.value)}
          />
          <button type="submit" disabled={busy || !name.trim()}>
            {busy ? COPY.onboarding.finishing : COPY.onboarding.next}
          </button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      )}

      {/* ── Step 2 — entity tiles + "not sure" ── */}
      {phase === "entity" && (
        <div className="onb-step">
          <span className="onb-kicker">{COPY.onboarding.entityEyebrow}</span>
          <h1 className="page-title">{COPY.onboarding.entityTitle}</h1>
          <p className="muted">{COPY.onboarding.entityLead}</p>
          {loadError && <p className="error" role="alert">{COPY.onboarding.loadError}</p>}
          <div className="onb-tiles" role="radiogroup" aria-label={COPY.onboarding.entityTitle}>
            {entities.map((e) => (
              <button
                key={e.key}
                type="button"
                className={`onb-tile${entityKey === e.key ? " on" : ""}`}
                aria-pressed={entityKey === e.key}
                onClick={() => { setEntityKey(e.key); setPhase("industry"); }}
              >
                <span className="onb-tile-label">{e.label}</span>
                <span className="onb-tile-desc muted">{e.description}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="onb-link"
            aria-label={COPY.onboarding.entityNotSureAria}
            onClick={() => setPhase("diagnostic")}
          >
            {COPY.onboarding.entityNotSure}
          </button>
        </div>
      )}

      {/* ── Step 2b — the "not sure" diagnostic ── */}
      {phase === "diagnostic" && (
        <Diagnostic
          entities={entities}
          onResolve={(key) => {
            if (key) setEntityKey(key);
            setPhase(key ? "industry" : "entity");
          }}
          onManual={() => setPhase("entity")}
        />
      )}

      {/* ── Step 3 — industry tiles (picking one seeds the CoA) ── */}
      {phase === "industry" && (
        <div className="onb-step">
          <span className="onb-kicker">{COPY.onboarding.industryEyebrow}</span>
          <h1 className="page-title">{COPY.onboarding.industryTitle}</h1>
          <p className="muted">{COPY.onboarding.industryLead}</p>
          {loadError && <p className="error" role="alert">{COPY.onboarding.loadError}</p>}
          <div className="onb-tiles" role="radiogroup" aria-label={COPY.onboarding.industryTitle}>
            {industries.map((ind) => (
              <button
                key={ind.key}
                type="button"
                className="onb-tile"
                disabled={busy}
                data-icon={ind.icon ?? undefined}
                onClick={() => finish(ind.key)}
              >
                <span className="onb-tile-label">{ind.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="onb-link" onClick={() => setPhase("entity")}>
            {COPY.onboarding.back}
          </button>
          {busy && <p className="muted" role="status">{COPY.onboarding.finishing}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      )}

      {/* ── Post-onboarding — skippable bank connect offer (in-journey) ── */}
      {phase === "done" && (
        <div className="onb-step onb-done">
          <span className="onb-kicker">{COPY.onboarding.doneEyebrow}</span>
          <h1 className="page-title">{COPY.onboarding.doneTitle(orgName)}</h1>
          <p className="muted">{COPY.onboarding.doneLead}</p>
          {seeded > 0 && <p className="muted">{COPY.onboarding.seededNote(seeded)}</p>}
          <div className="onb-actions">
            <button type="button" onClick={goConnectBank}>
              {COPY.onboarding.connectBank}
            </button>
            <button type="button" className="onb-link" onClick={skip}>
              {COPY.onboarding.skipForNow}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The "not sure" 2-question diagnostic. Questions + resolution are seed-driven
 *  (diagnostic.ts); this component only walks the quiz and reports the result. */
function Diagnostic({
  entities,
  onResolve,
  onManual,
}: {
  entities: EntityTypeSeed[];
  onResolve: (entityKey: string | null) => void;
  onManual: () => void;
}) {
  const quiz = useMemo(() => buildQuiz(entities, DIAGNOSTIC_MAX), [entities]);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const done = answers.length >= quiz.length;
  const result = useMemo(
    () => (done ? resolveDiagnostic(entities, quiz, answers) : null),
    [done, entities, quiz, answers],
  );

  const answer = (yes: boolean): void => setAnswers((a) => [...a, yes]);

  if (quiz.length === 0) { onManual(); return null; }

  return (
    <div className="onb-step onb-diagnostic">
      <span className="onb-kicker">{COPY.onboarding.diagnosticTitle}</span>
      <p className="muted">{COPY.onboarding.diagnosticLead}</p>

      {!done && (
        <div className="onb-question">
          <p className="onb-q">{quiz[answers.length].q}</p>
          <div className="onb-yesno">
            <button type="button" onClick={() => answer(true)}>{COPY.onboarding.diagnosticYes}</button>
            <button type="button" onClick={() => answer(false)}>{COPY.onboarding.diagnosticNo}</button>
          </div>
        </div>
      )}

      {done && result?.entity && (
        <div className="onb-result">
          <p className="onb-q">{COPY.onboarding.diagnosticResult(result.entity.label)}</p>
          <p className="onb-tile-desc muted">{result.entity.description}</p>
          <div className="onb-actions">
            <button type="button" onClick={() => onResolve(result.entityKey)}>
              {COPY.onboarding.diagnosticUseThis}
            </button>
            <button type="button" className="onb-link" onClick={onManual}>
              {COPY.onboarding.diagnosticPickManually}
            </button>
          </div>
        </div>
      )}

      {done && !result?.entity && (
        <div className="onb-result">
          <p className="muted">{COPY.onboarding.diagnosticInconclusive}</p>
          <button type="button" onClick={onManual}>
            {COPY.onboarding.diagnosticPickManually}
          </button>
        </div>
      )}
    </div>
  );
}
