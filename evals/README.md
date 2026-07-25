# `/evals` — deterministic gate eval harness

A small, self-contained runner that scores Penny's **deterministic floor gates**
against a labeled dataset. It imports the real gate functions from
`packages/inference/src/judge.ts` — it does not reimplement them — so a green run
reflects the exact code that grades production answers.

It touches **no network, no database, and no production paths**. It is additive
scaffolding for growing the golden set; the authoritative gate tests remain
`packages/inference/test/judge.ts` (`pnpm check:judge`).

## Run

```bash
pnpm eval:gates      # or: tsx evals/run.ts
```

## What it reports

- **safety** and **privacy** (blocking gates): precision / recall / F1, where a
  "positive" is correctly **blocking a bad answer** (`pass === false`). TP = bad
  answer blocked, FP = good answer wrongly blocked, FN = bad answer let through.
- **valid_format**, **source_exists**, **math** (structural gates): pass/fail
  accuracy.

The run exits non-zero if any labeled case is misclassified, so it can be wired into
CI once the golden set is trusted.

## Files

- `dataset.jsonl` — one labeled case per line: `{ id, gate, answer|answerJson, context?, expectPass }`.
- `run.ts` — the runner; imports the real gates and prints the scorecard.

## Extending the golden set

Add lines to `dataset.jsonl`. Good candidates: real correction cases from the review
queue (de-identified), injection-canary variants for `safety`, and PII edge cases for
`privacy`. Keep every example de-identified — never commit real customer data. As the
categorization outcome data accumulates, this harness is the natural home for a
precision/recall/F1 report on the categorization classifier itself, alongside the
gates.

See [`docs/EVALS.md`](../docs/EVALS.md) for the full eval strategy and how this fits
the tiered panel.
