/**
 * W3.3 — the "not sure" entity diagnostic + the kernel-seed-drives-options
 * invariant. Pure-data tests (React-free), run in the node environment.
 *
 * These load the REAL kernel seeds (supabase/seeds/kernel/*.json) so:
 *   - the diagnostic resolves the same entities the shipped seed would show
 *   - "add an entity/industry via seed alone → it appears" is proven against the
 *     actual loader input, not a fixture (acceptance: adding a test entity/industry
 *     via the seed makes it appear; the diagnostic resolves to an entity)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildQuiz,
  resolveDiagnostic,
  type EntityTypeSeed,
  type QuizStep,
} from "./diagnostic";

const KERNEL = resolve(__dirname, "../../../../supabase/seeds/kernel");
function seed<T>(file: string): T[] {
  return (JSON.parse(readFileSync(resolve(KERNEL, file), "utf8")).rows ?? []) as T[];
}
const ENTITIES = seed<EntityTypeSeed>("entity_types.json");

// Answer a quiz by picking YES for every question owned by `wantKey`, and for a
// 'not_this_if_yes' question NO (don't rule the target out); everything else NO.
function answerFor(quiz: QuizStep[], wantKey: string): boolean[] {
  return quiz.map((s) => {
    if (s.helps_pick === "not_this_if_yes") return false;
    return s.ownerKey === wantKey;
  });
}

describe("W3.3 · entity diagnostic (kernel-driven)", () => {
  it("flattens the seed's per-entity questions into an ordered quiz, deduped", () => {
    const quiz = buildQuiz(ENTITIES);
    expect(quiz.length).toBeGreaterThan(0);
    // No hardcoded questions: every quiz step traces back to a seed row.
    for (const step of quiz) {
      const owner = ENTITIES.find((e) => e.key === step.ownerKey);
      expect(owner).toBeTruthy();
      expect(owner!.diagnostic_questions.some((d) => d.q === step.q)).toBe(true);
    }
    // Dedup: no question text repeats.
    const texts = quiz.map((s) => s.q.trim().toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("caps the quiz to the requested length (the '2-question diagnostic')", () => {
    expect(buildQuiz(ENTITIES, 2).length).toBe(2);
  });

  it("resolves a YES on an entity's own primary question to THAT entity", () => {
    const quiz = buildQuiz(ENTITIES);
    for (const e of ENTITIES) {
      // Only entities whose FIRST diagnostic question is a hard entity-key pick are
      // resolvable from a single YES — that's the seed's design for sole_prop/
      // partnership/s_corp/c_corp/nonprofit.
      const first = e.diagnostic_questions[0];
      if (!first || !ENTITIES.some((x) => x.key === first.helps_pick)) continue;
      const res = resolveDiagnostic(ENTITIES, quiz, answerFor(quiz, e.key));
      expect(res.entityKey).toBe(e.key);
      expect(res.entity?.label).toBe(e.label);
    }
  });

  it("returns null (no forced pick) when nothing scores positive", () => {
    const quiz = buildQuiz(ENTITIES);
    const allNo = quiz.map(() => false);
    expect(resolveDiagnostic(ENTITIES, quiz, allNo).entityKey).toBeNull();
  });

  it("KERNEL DRIVES OPTIONS: a new seeded entity becomes diagnosable with no code change", () => {
    const CO_OP: EntityTypeSeed = {
      key: "co_op",
      label: "Cooperative",
      description: "Member-owned cooperative.",
      diagnostic_questions: [
        { q: "Is the business a member-owned cooperative?", helps_pick: "co_op" },
      ],
      sort_order: 999,
    };
    const withCoop = [...ENTITIES, CO_OP];
    const quiz = buildQuiz(withCoop);
    // The new question appears in the quiz purely from the seed row.
    expect(quiz.some((s) => s.ownerKey === "co_op")).toBe(true);
    // …and a YES on it resolves to the new entity — zero code edits.
    const res = resolveDiagnostic(withCoop, quiz, answerFor(quiz, "co_op"));
    expect(res.entityKey).toBe("co_op");
  });
});
