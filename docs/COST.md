# Cost

What transaction categorization costs, and which decision actually controls it.

Regenerate with `pnpm cost:model`. The figures come from
[`scripts/cost-model.mjs`](../scripts/cost-model.mjs), which parses `DEFAULT_PRICES` out of
`packages/inference/src/core.ts` and the three cascade tiers out of
`supabase/functions/categorize/index.ts`. Nothing below is retyped.

## The headline: the cheapest call is the one never made

| | Per month, 4,000 transactions |
|---|---|
| **As built** | **$2.00** |
| If nothing resolved by rule | $9.99 |
| If every transaction ran on Opus | $27.00 |

All in, that is **$0.0005 per transaction**, about a twentieth of a cent.

The funnel is where that comes from:

| | Transactions | |
|---|---|---|
| Resolved deterministically | **3,200 (80%)** | **no model call at all** |
| Cheap tier only | 640 | Haiku |
| Escalated to reasoning | 120 | Sonnet |
| Escalated to hardest | 40 | Opus |

**Four fifths of the volume never reaches a model.** The deterministic rule plus vendor prior
resolves it, and that single design decision is worth $8 of the $27 a naive implementation
would spend. The difficulty cascade then saves a further $17 on the residue.

Both matter, but they are not the same kind of decision, and the more valuable one is not
about models at all. **A cost model that starts at "which model should we use" has already
skipped the question that controls the answer.**

## The tiers, priced

| Tier | Model | Per call |
|---|---|---|
| cheap | claude-haiku-4-5 | $0.00135 |
| reasoning | claude-sonnet-4-6 | $0.00405 |
| hardest | claude-opus-4-8 | $0.00675 |

Roughly 600 tokens in and 150 out per categorization. Opus is 5x Haiku for identical text.

**An escalated transaction is charged for the rungs below it too.** The cascade tries cheap
first, then reasoning, then hardest, so a transaction that ends on Opus has already paid for a
Haiku call and a Sonnet call. Counting only the final rung would understate every escalation,
and the model above does not make that mistake.

## The number this all rests on

**The 80% deterministic-resolution rate is the single most important assumption here, and the
least well evidenced.** The code says the rule path is "the common path" and that bulk
transactions "never reach here at all". 80% is a conservative reading of that sentence. It is
not a measurement.

The sensitivity is severe. At 50% the bill roughly triples. At 95% it more than halves. Every
other assumption in this document is a rounding error beside it, and it is the first thing
that should be replaced with a real number from `ai_decisions`.

## What is measured, estimated, and assumed

| | |
|---|---|
| **Measured from source** | every per-million-token price, and all three cascade tier model ids |
| **Estimated** | token counts, as characters / 4. Not calibrated against Anthropic's tokenizer |
| **Assumed** | the deterministic rate, both escalation rates, prompt and reply sizes, and 4,000 transactions a month |

**Every dollar figure is an order of magnitude, not a bill.**

## Why the prices are worth trusting now, and were not before

Until 2026-08-02, `DEFAULT_PRICES` carried `claude-opus-4-8` at **$15/$75** per million
tokens. The published rate is **$5/$25**. Those were Opus-3-era prices, and because
`costUsd()` reads that table and the result lands on `ai_decisions`, every Opus call had been
recorded at three times its real cost. The hardest tier looked 15x the cheap tier when it is
5x.

The comment above that table is the instructive part. It says the prices were verified against
the Anthropic price list, and it names **only Haiku and Sonnet**. The Opus row was added
afterwards and was never covered by that verification, so the sentence stayed true while the
table stopped being.

**A verification note that records what it checked survives later edits. One that just says
"verified" does not.**

Because this script reads the table rather than restating it, correcting one line moved every
figure in this document.

## Not covered here

**Audio.** `content-audio` routes to a Fly-hosted voice engine (`founderfirst-kokoro`, with
`founderfirst-tts` as an alternative). That is machine time, not tokens, so it does not belong
in a per-token model. It is a real cost and it is not counted above.

**The other three routed use cases.** `penny_chat`, `insights`, `email_compose` and
`content_draft` route through the same inference core. `email_compose` runs on a Workers-AI
free-tier model at zero cost. Conduit's `docs/COST.md` models that shared routing table; this
document deliberately covers the path that is specific to FounderFirst.

## What this document does not claim

**The cascade is chosen, not validated.** The cheap tier runs on Haiku because Haiku is cheap,
not because Haiku was measured as good enough on FounderFirst's own transactions. The
escalation thresholds reuse the medium-confidence cutoff, which keeps the model path and the
confidence path consistent, but nothing has measured whether that cutoff is the right place to
spend more.

**Nothing here is metered yet.** `resolve()` prices every real call and writes it to
`ai_decisions`, so one month of live traffic makes this script redundant for anything except
forecasting, and would replace the 80% assumption with a fact.

## Related

Prices were audited across all five products on 2026-08-02. Three of five were wrong, in two
different ways: FounderFirst and Rally both carried the stale Opus row feeding a live meter,
and Conduit billed any unpriced model at zero. Pulse and RoleOS were correct.
