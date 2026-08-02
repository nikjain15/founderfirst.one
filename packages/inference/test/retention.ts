/**
 * Retention + PII-minimization tests (finding S-3).
 *
 * Two things were true before this: `ai_decisions.input` stored every prompt
 * verbatim because `storeInput` defaulted on, and `ai_decisions.retain_until`
 * was read by no code at all. These tests hold the code side of both fixes:
 *
 *   - the DEFAULT is now "redacted", so a call site that says nothing gets the
 *     safe answer rather than the convenient one;
 *   - a `financial` use case is forced to "none" and no caller can widen it;
 *   - the RETENTION table cannot declare a window with nothing enforcing it,
 *     which is the property that stopped GUARDRAILS.md describing a job that
 *     did not exist.
 *
 * Pure + deterministic; no network, no DB. Run: `pnpm check:retention`.
 */
import {
  resolveInputPolicy,
  redactPii,
  redactMessages,
  resolve,
  DEFAULT_INPUT_POLICY,
  RETENTION,
  AI_DECISIONS_RETAIN_DAYS,
  DEFAULT_CONFIG,
  type AiDecisionRecord,
  type ResolveCtx,
} from "../src/core";

let failures = 0;
function expect(label: string, cond: boolean, detail = ""): void {
  if (cond) console.info(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}${detail ? `\n    ${detail}` : ""}`);
  }
}
function eq(label: string, actual: unknown, expected: unknown): void {
  expect(label, actual === expected, `actual: ${JSON.stringify(actual)}  expected: ${JSON.stringify(expected)}`);
}

/* ── 1. the default is the safe answer ───────────────────────────────────── */

console.info("\ninput policy: defaults");
eq("an unset record defaults to redacted", resolveInputPolicy(undefined, undefined), "redacted");
eq("an empty record defaults to redacted", resolveInputPolicy({}, undefined), "redacted");
eq("DEFAULT_INPUT_POLICY is not raw", DEFAULT_INPUT_POLICY === "raw", false);

/* ── 2. legacy storeInput keeps meaning what its author meant ────────────── */

console.info("\ninput policy: legacy storeInput");
eq("storeInput false still stores nothing", resolveInputPolicy({ storeInput: false }, undefined), "none");
eq(
  "storeInput true no longer means verbatim",
  resolveInputPolicy({ storeInput: true }, undefined),
  "redacted",
);

/* ── 3. financial is forced, and cannot be widened ───────────────────────── */

console.info("\ninput policy: financial use cases");
eq("financial forces none", resolveInputPolicy({}, { financial: true }), "none");
eq(
  "financial overrides an explicit raw request",
  resolveInputPolicy({ inputPolicy: "raw" }, { financial: true }),
  "none",
);
eq(
  "financial overrides an explicit redacted request",
  resolveInputPolicy({ inputPolicy: "redacted" }, { financial: true }),
  "none",
);
eq(
  "financial overrides storeInput true",
  resolveInputPolicy({ storeInput: true }, { financial: true }),
  "none",
);
eq("non-financial may still opt into raw", resolveInputPolicy({ inputPolicy: "raw" }, { financial: false }), "raw");
eq("inputPolicy wins over storeInput", resolveInputPolicy({ storeInput: false, inputPolicy: "raw" }, undefined), "raw");

/* ── 4. redaction removes what it claims to remove ───────────────────────── */

console.info("\nredaction");
const cases: Array<[string, string, string]> = [
  ["email", "ping owner@acme-books.com about it", "[email]"],
  ["ssn", "SSN 123-45-6789 on file", "[ssn]"],
  ["ein", "EIN 12-3456789", "[ein]"],
  ["card", "card 4111 1111 1111 1111 declined", "[card]"],
  ["phone", "call (415) 555-0134 back", "[phone]"],
  ["dollar amount", "charge of $1,284.50 posted", "[amount]"],
  ["usd amount", "USD 900.00 wire", "[amount]"],
  // 12 digits is short of the card rule's 13-19, so it falls through to the
  // generic long-run rule. Masked either way; the label is just less specific.
  ["account number", "acct 000123456789 at the bank", "[number]"],
  ["long id", "ref 8837412 in the batch", "[number]"],
];
for (const [label, input, marker] of cases) {
  const out = redactPii(input);
  expect(`redacts ${label}`, out.includes(marker), `got: ${out}`);
}
expect("leaves ordinary prose alone", redactPii("Reconcile the March close") === "Reconcile the March close");
expect(
  "leaves small numbers alone (a line count is not PII)",
  redactPii("12 entries in 3 accounts") === "12 entries in 3 accounts",
  `got: ${redactPii("12 entries in 3 accounts")}`,
);
expect(
  "does NOT claim to remove a merchant name, which is why financial is 'none'",
  redactPii("payment to Blue Bottle Coffee").includes("Blue Bottle Coffee"),
);

console.info("\nredaction over a message array");
const msgs = [
  { role: "system" as const, content: "You are a bookkeeper." },
  { role: "user" as const, content: "Categorize $84.20 from owner@acme.com" },
];
const red = redactMessages(msgs);
eq("preserves length", red.length, 2);
eq("preserves role", red[1].role, "user");
expect("masks the amount and the email", red[1].content === "Categorize [amount] from [email]", `got: ${red[1].content}`);
expect("does not mutate the input array", msgs[1].content.includes("owner@acme.com"));

/* ── 5. resolve() writes what the policy says, end to end ────────────────── */

console.info("\nresolve() -> ai_decisions.input");

function ctxWith(records: AiDecisionRecord[], meta?: Record<string, { main: { provider: "anthropic"; model: string }; financial?: boolean }>): ResolveCtx {
  return {
    runtime: "node",
    now: () => 0,
    config: meta ? { ...DEFAULT_CONFIG, meta } : DEFAULT_CONFIG,
    transports: {
      anthropic: {
        apiKey: "TEST_KEY",
        fetch: async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              content: [{ type: "text", text: "ok" }],
              usage: { input_tokens: 10, output_tokens: 2 },
            }),
            text: async () => "",
          }) as unknown as Response,
      },
    },
    recordSink: (r: AiDecisionRecord) => void records.push(r),
  } as unknown as ResolveCtx;
}

const pin = { provider: "anthropic" as const, model: "claude-haiku-4-5" };
const secret = "Categorize $84.20 from owner@acme.com";

async function run() {
  {
    const got: AiDecisionRecord[] = [];
    await resolve(
      { useCase: "u", tenantId: "org:x", messages: [{ role: "user", content: secret }], maxTokens: 10, pinModel: pin },
      ctxWith(got),
    );
    const input = got[0].input as { messages: { content: string }[]; redacted?: boolean };
    expect("an unset record stores a redacted prompt, not a verbatim one", !input.messages[0].content.includes("owner@acme.com"), `got: ${JSON.stringify(input)}`);
    expect("and flags that it was redacted", input.redacted === true);
  }
  {
    const got: AiDecisionRecord[] = [];
    await resolve(
      {
        useCase: "fin",
        tenantId: "org:x",
        messages: [{ role: "user", content: secret }],
        maxTokens: 10,
        pinModel: pin,
        record: { inputPolicy: "raw" },
      },
      ctxWith(got, { fin: { main: pin, financial: true } }),
    );
    eq("a financial use case stores null even when the caller asked for raw", got[0].input, null);
  }
  {
    const got: AiDecisionRecord[] = [];
    await resolve(
      {
        useCase: "u",
        tenantId: "org:x",
        messages: [{ role: "user", content: secret }],
        maxTokens: 10,
        pinModel: pin,
        record: { inputPolicy: "raw" },
      },
      ctxWith(got),
    );
    const input = got[0].input as { messages: { content: string }[] };
    expect("an explicit raw opt-in on a non-financial use case is honored", input.messages[0].content === secret);
  }

  /* ── 6. a window nothing enforces cannot be declared ───────────────────── */

  console.info("\nRETENTION table invariants");
  for (const [key, r] of Object.entries(RETENTION)) {
    expect(`${key}: has a store, a data description and an erasure sentence`, !!r.store && !!r.data && !!r.erasure);
    if (r.days !== null) {
      expect(
        `${key}: declares ${r.days} days AND names the job that enforces it`,
        typeof r.enforcedBy === "string" && r.enforcedBy.length > 0,
        "a number with nothing behind it is the exact failure this table exists to prevent",
      );
      expect(`${key}: the window is a positive number of days`, r.days > 0);
    }
    if (r.enforcedBy === null) {
      expect(`${key}: no enforcer means no automatic window`, r.days === null);
    }
  }
  eq("the ai_decisions raw window is still 90 days", AI_DECISIONS_RETAIN_DAYS, 90);
  eq(
    "and the SQL job name is the one the migration schedules",
    RETENTION.ai_decisions_raw.enforcedBy,
    "ai-decisions-retention-daily",
  );

  console.info("");
  if (failures) {
    console.error(`✗ retention: ${failures} failure(s).`);
    process.exit(1);
  }
  console.info("✓ retention: input policy defaults safe, financial is forced, and every declared window names its job.");
}

void run();
