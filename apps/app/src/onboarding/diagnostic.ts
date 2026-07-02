/**
 * The "not sure" entity diagnostic — PURE logic, kernel-driven (W3.3).
 *
 * The entity_types seed carries, per entity, a small list of yes/no
 * diagnostic_questions of the form { q, helps_pick }. `helps_pick` is a hint token:
 *   - a real entity key ('sole_prop', 's_corp', …) → a YES points at that entity
 *   - 'not_this_if_yes'                            → a YES RULES OUT this row's entity
 *   - any other token (e.g. 's_corp_reasonable_comp', 'c_corp_common') → a soft
 *     nudge toward the entity named in the token's prefix, never a hard pick
 *
 * There is NO hardcoded question list or entity list here — everything comes from
 * the seed rows passed in. Adding an entity (with its own diagnostic questions) via
 * the seed changes the flow with zero code edits. This module only:
 *   1. flattens the per-entity questions into an ordered quiz (dedup by text), and
 *   2. resolves a set of yes/no answers to a single suggested entity key (or none).
 */

export interface DiagnosticQuestion {
  q: string;
  helps_pick: string;
}

export interface EntityTypeSeed {
  key: string;
  label: string;
  short_label?: string | null;
  description: string;
  diagnostic_questions: DiagnosticQuestion[];
  sort_order?: number;
}

/** One question as shown in the quiz, carrying its source entity + hint. */
export interface QuizStep {
  q: string;
  /** The entity_types.key this question belongs to. */
  ownerKey: string;
  helps_pick: string;
}

const RULE_OUT = "not_this_if_yes";

/** True when a hint token is a concrete entity key present in the seed set. */
function isEntityKey(token: string, keys: Set<string>): boolean {
  return keys.has(token);
}

/**
 * Flatten the seed's per-entity diagnostic questions into an ordered quiz. Entities
 * are visited in sort_order; within an entity, questions keep their seed order.
 * Duplicate question text (same wording appearing under two entities) is asked once.
 * Capped to `max` questions so the "2-question diagnostic" stays short — but the cap
 * comes from the caller, not hardcoded here.
 */
export function buildQuiz(entities: EntityTypeSeed[], max = Infinity): QuizStep[] {
  const ordered = [...entities].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const seen = new Set<string>();
  const steps: QuizStep[] = [];
  for (const e of ordered) {
    for (const dq of e.diagnostic_questions ?? []) {
      const norm = dq.q.trim().toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      steps.push({ q: dq.q, ownerKey: e.key, helps_pick: dq.helps_pick });
      if (steps.length >= max) return steps;
    }
  }
  return steps;
}

export interface DiagnosticResult {
  /** The suggested entity_types.key, or null when the answers don't resolve one. */
  entityKey: string | null;
  /** The seed row for the suggestion, if resolved (convenience for copy). */
  entity: EntityTypeSeed | null;
}

/**
 * Resolve yes/no answers (indexed to the quiz steps) into a suggested entity.
 *
 * Scoring, all seed-driven:
 *   - A YES on a question whose helps_pick is a real entity key → +2 for that entity.
 *   - A YES on a 'not_this_if_yes' question → the owning entity is ELIMINATED.
 *   - A YES on a soft-nudge token → +1 for the entity named by the token's prefix
 *     (the longest entity key that prefixes the token), if any.
 *   - A NO on a real-entity-key question → small −1 against that entity (a "no" to
 *     "are you the only owner?" argues against sole_prop).
 * The highest positive score that isn't eliminated wins; ties or an all-zero board
 * resolve to null (the UI then asks the owner to pick manually).
 */
export function resolveDiagnostic(
  entities: EntityTypeSeed[],
  quiz: QuizStep[],
  answers: boolean[],
): DiagnosticResult {
  const byKey = new Map(entities.map((e) => [e.key, e]));
  const keys = new Set(entities.map((e) => e.key));
  const score = new Map<string, number>();
  const eliminated = new Set<string>();
  for (const k of keys) score.set(k, 0);

  // Longest entity key that is a prefix of a soft-nudge token (e.g.
  // 's_corp_reasonable_comp' → 's_corp'). Kernel-driven, no literal map.
  const nudgeTarget = (token: string): string | null => {
    let best: string | null = null;
    for (const k of keys) {
      if (token.startsWith(k) && (best === null || k.length > best.length)) best = k;
    }
    return best;
  };

  quiz.forEach((step, i) => {
    const yes = answers[i];
    if (yes === undefined) return;
    const hint = step.helps_pick;
    if (hint === RULE_OUT) {
      if (yes) eliminated.add(step.ownerKey);
      return;
    }
    if (isEntityKey(hint, keys)) {
      score.set(hint, (score.get(hint) ?? 0) + (yes ? 2 : -1));
      return;
    }
    // soft nudge
    const target = nudgeTarget(hint);
    if (target && yes) score.set(target, (score.get(target) ?? 0) + 1);
  });

  let bestKey: string | null = null;
  let bestScore = 0;
  let tie = false;
  for (const [k, s] of score) {
    if (eliminated.has(k)) continue;
    if (s > bestScore) {
      bestScore = s;
      bestKey = k;
      tie = false;
    } else if (s === bestScore && s > 0) {
      tie = true;
    }
  }
  const entityKey = tie || bestScore <= 0 ? null : bestKey;
  return { entityKey, entity: entityKey ? byKey.get(entityKey) ?? null : null };
}
