/**
 * @conduit/agent public surface.
 *
 * A pure, testable bounded agent loop built on the same injection discipline as
 * @conduit/inference: the model call and every tool effect are injected, so the
 * loop itself has no runtime globals and is exercised entirely with mocks in tests.
 *
 *   - runAgent(...)      the bounded reason-act loop (loop.ts).
 *   - Tool / ToolSpec    a validated, optionally side-effecting capability (tool.ts).
 *   - Skill              a declarative, intent-selected instruction module (skill.ts).
 *   - validate(...)      the JSON-schema argument validator the loop uses (schema.ts).
 *
 * No-authority invariant: a tool with `sideEffecting: true` is refused unless the
 * run is invoked with `allowSideEffects: true`. Default deny.
 */
export { runAgent } from "./loop.ts";
export type {
  CallModel,
  ModelTurn,
  RunAgentInput,
  RunAgentResult,
  StepRecord,
  AgentError,
  AgentErrorKind,
} from "./loop.ts";

export { toToolSpec } from "./tool.ts";
export type { Tool, ToolSpec } from "./tool.ts";

export { selectSkills } from "./skill.ts";
export type { Skill, SkillContext } from "./skill.ts";

export { validate } from "./schema.ts";
export type { JsonSchema, JsonSchemaType, ValidationError, ValidationResult } from "./schema.ts";
