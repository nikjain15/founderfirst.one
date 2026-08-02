# Runbook: a bad model or prompt change is live

> Last verified: 2 Aug 2026. Owner: Nik.
> Closes finding S-8 in [STAKEHOLDERS.md](STAKEHOLDERS.md) §4a. §6 of this file
> records what it does not close.
>
> Scope: an AI change is in production and is hurting users. Infrastructure,
> database and secret incidents are in
> [plans/production-readiness-runbook.md](plans/production-readiness-runbook.md),
> which covers backup, restore and SLOs but says nothing about AI rollback. This
> file is the AI half. Read it before you need it.

Prod project ref: `ejqsfzggyfsjzrcevlnq`. Admin surface: `/admin/ai-quality`.

---

## 0. The one thing to know first

**Almost every AI change in this system is a data change, not a deploy.** Models,
prompts, personas and autonomy thresholds all live in Postgres, are read through
service-role RPCs, and are cached for **60 seconds per isolate**. That means:

- the fastest rollback is a single RPC call and it lands in **under a minute**;
- a code revert through `deploy-worker.yml` (2 to 4 min) or `pages.yml` (6 to 12
  min) is the **slow** path, and you should only take it for the two prompt
  surfaces that are genuinely code (§3.4);
- because there is no cache-purge command, "under a minute" means up to 60
  seconds after the write, per isolate. Do not conclude a rollback failed at
  t+20s.

**Nothing in this system pages you.** Every signal in §1 is a dashboard someone
has to open, or a table someone has to query. That is the honest state and it is
recorded as an open gap in §6. In practice the first alert is a customer.

---

## 1. What tells you it is happening

In the order you will actually notice.

| Signal | Where | Threshold | Latency to notice |
| --- | --- | --- | --- |
| A customer says Penny miscategorised something | Discord, email | none | minutes to days |
| `breached = true` from `admin_ai_suqs(1)` | `/admin/ai-quality#models` | p95 latency, cost per answer, or block rate over the seeded SLO | you have to look |
| Gate-block rate spike | `admin_ai_kpis(1)` → `awaiting_review` | `penny_chat` 2%, `insights` 5%, `email_compose` 2% | you have to look |
| Zero-edit rate collapse | `admin_ai_review_kpis(7)` → `zero_edit_pct` | ramp step-down fires below **85%** over ≥10 reviews | you have to look |
| Ramp recommends step-down | `admin_ai_ramp_recommendations(7)` | rationale reads "Corrections rising, recommend returning to full review." | you have to look |
| The model changed and you did not change it | `admin_ai_usecases(1)` → `models text[]` | any model you did not expect | you have to look |

### The first query to run

```sql
-- What is actually being called, and how is it doing, over the last day?
select * from admin_ai_suqs(1);
select * from admin_ai_usecases(1);   -- the `models` array is the ground truth
select admin_ai_kpis(1);
```

`admin_ai_usecases(p_days).models` is `array_agg(distinct model)` over real
traffic. It is the only place that tells you what is *running*, as opposed to
what is *configured*. If those disagree, an isolate is serving a stale config
cache and you wait 60 seconds, or the twin RPC is failing (see §5).

### Then: what changed, and when

```sql
select created_at, action, target_id, payload, actor_email
  from admin_audit
 where action in ('ai_model_config.set','ai_price.set','ai_review_mode.set')
 order by created_at desc limit 20;
```

Every model and review-mode change goes through an `is_admin()` RPC that writes
`admin_audit`. **The payload of the previous row is what you roll back to.**
Prompt changes are versioned rows rather than audit entries (`list_prompts()`,
`list_app_persona('app')`) and versions are never deleted, so the previous body
is always still there.

---

## 2. Decide the blast radius before you touch anything

The rollback order below is driven by one question: **can this change write to
the ledger?** Answer it first, in about thirty seconds.

```sql
select behavior from platform_config;             -- confidence_high / confidence_medium
select * from admin_ai_ramp_recommendations(7);   -- review_mode per use case
select count(*) from penny_activity
 where created_at > now() - interval '24 hours';  -- has Penny actually posted?
```

The path from a model answer to a posted journal entry is:

```
categorize (op: "triage")
  -> computeProposal()  -> a rule / vendor prior / model answer with a confidence
  -> tierFor(confidence, source, cfg)
       source in ('rule','vendor_prior')  -> HIGH by provenance, confidence ignored
       confidence >= confidence_high (0.75) -> HIGH
       confidence >= confidence_medium (0.45) -> MEDIUM
       otherwise -> LOW
  -> HIGH   : svc.rpc("autopost_categorization", …)  ** POSTS TO THE LEDGER, NO HUMAN **
     MEDIUM : returns a proposal card, a human confirms
     LOW    : review card, or the weekly digest when the ≤5-asks budget is spent
```

**Only the HIGH tier writes without a human.** So:

- A bad **prompt** that lowers stated confidence is largely self-limiting: the
  answers fall to MEDIUM or LOW and queue for a human. Bad, not urgent.
- A bad **prompt or model that is confidently wrong** is the dangerous case. It
  produces `confidence >= 0.75` on wrong answers and autoposts them. **Go to
  §3.1 first, before you diagnose anything.**
- A bad change to anything reaching `source = 'rule'` or `'vendor_prior'` is
  worse still, because provenance makes it HIGH regardless of confidence.

`autopost_categorization` records an `undo_entry_id` in `penny_activity`, so
posted entries are reversible one at a time via `undo_penny_activity`. There is
no bulk undo. That is the cost of getting §3.1 wrong, and it is why §3.1 is
first.

---

## 3. Roll back, fastest lever first

Do these in order. Do not skip to the elegant fix.

### 3.1 Stop autoposting: 1 RPC, effective in under 60 seconds

The single widest, cheapest kill switch. It does not stop the AI answering; it
stops any answer from reaching the ledger unattended, because nothing can reach
the HIGH tier.

```sql
select set_platform_behavior('{"confidence_high": 1.01}'::jsonb);
```

`tierFor` compares `confidence >= confidence_high` and confidence is clamped to
`[0, 1]`, so 1.01 is unreachable by construction.

**Caveat, and it matters:** this does **not** stop `source = 'rule'` or
`'vendor_prior'`, which are HIGH by provenance and never consult the cutoff. If
the incident involves learned rules, also deactivate the rule
(`deactivate_categorization_rule`). There is no global rule kill switch, which
is an open gap (§6).

`set_platform_behavior` merges rather than replaces, so this one key changes and
`confidence_medium`, `asks_per_week` and the rest stay as they were.

**Restore afterwards:** `select set_platform_behavior('{"confidence_high": 0.75}'::jsonb);`
0.75 is the seeded default in `20260702050100_platform_config_behavior.sql` and
must stay in step with `apps/app/src/copy/config.ts`.

*Time: one round trip, plus up to 60s of config cache. Reversible. No deploy.*

### 3.2 Put humans back in the loop: 1 RPC per use case, under 60 seconds

If the use case had been ramped to sampling, everything not sampled is going out
unreviewed.

```sql
select admin_ai_set_review_mode('penny_chat', 'full', 1.0);
select admin_ai_set_review_mode('insights',   'full', 1.0);
```

Gate stops (`blocked`, `escalated`, `failed_closed`) always queue regardless of
review mode. The floor never relaxes. This restores review for everything else.
Audit-logged as `ai_review_mode.set`.

*Time: seconds. Reversible. No deploy.*

### 3.3 Revert the model: 1 RPC, under 60 seconds

Read the previous value out of `admin_audit` (§1) rather than typing it from
memory.

```sql
select admin_ai_model_config_set(
  'penny_chat',                                    -- p_use_case
  'anthropic', 'claude-haiku-4-5-20251001',        -- main provider, model
  'workers-ai', '@cf/meta/llama-3.3-70b-instruct-fp8-fast',  -- backup pair
  false,                                           -- cache_enabled
  null                                             -- monthly_cap_usd
);
```

The seeded baseline, if the audit trail is unhelpful:

| use case | runtime | main | backup |
| --- | --- | --- | --- |
| `penny_chat` | workers | anthropic / `claude-haiku-4-5-20251001` | workers-ai / `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| `insights` | deno | anthropic / `claude-sonnet-4-6` | none |
| `email_compose` | workers | workers-ai / `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | none |

**Three traps in this RPC, all of which have a 2am cost:**

1. `p_monthly_cap_usd` is assigned directly, not `coalesce`d. **Passing `null`
   clears the cap.** If a cap was set, pass it again explicitly.
2. `backup_provider` and `backup_model` must both be null or both be set
   (`ai_model_config_backup_pair`). Half a pair is rejected.
3. A `@cf/*` model on a non-`workers` runtime is rejected by
   `trg_ai_model_config_guard`. That is the guard working; pick an Anthropic
   model for `insights`.

**`penny_categorize` is not in this table.** The categorize function pins its
model from `ANTHROPIC_MODEL` in the edge function environment, so rolling back
the categorizer's *model* is an env change plus a redeploy (§3.5), not an RPC.
This asymmetry is the most likely thing to waste ten minutes.

*Time: seconds to write, up to 60s to take effect. Reversible. No deploy.*

### 3.4 Revert the prompt

Which lever depends on which prompt. Check this table before you revert
anything, because two of these six are code and four are not.

| Surface | Store | Rollback | Time |
| --- | --- | --- | --- |
| Bubble + Discord system prompt | `penny_prompts` | `set_live_prompt(prev_id)` | <60s |
| In-app persona (categorize, penny-thread) | `penny_app_persona`, per surface | `set_live_app_persona(prev_id)` | <60s |
| Voice preface | `penny_voice` | set-live previous version | <60s |
| Site page copy | `content_*` via `@ff/content` | republish the previous version | triggers a full `pages.yml` run, 6 to 12 min |
| `site-bubble/worker/src/prompt-guardrails.ts` | code | git revert + `deploy-worker.yml` | 2 to 4 min |
| `site-bubble/worker/src/system-prompt.ts` | code, generated | git revert + `deploy-worker.yml` | 2 to 4 min |

The data path:

```sql
select id, version, notes, is_live, created_at from list_prompts();
select set_live_prompt('<the id of the last good version>');
```

`penny_prompts_one_live` is a unique partial index on `is_live where is_live`, so
there is exactly one live version at any moment and `set_live_prompt` swaps it
atomically. Versions are never deleted. The same shape applies to
`set_live_app_persona(p_id)`, but note it is **surface-scoped**, so
`list_app_persona('app')` and `list_app_persona('thread')` are separate
histories and you may need both.

`prompt-guardrails.ts` is deliberately not editable from the admin: it locks the
JSON output schema the Worker's parser depends on. A bad edit there shows up as
the Worker returning 500s rather than as bad answers, and the only fix is a
deploy.

*Time: <60s for the data surfaces. 2 to 4 min for the Worker.*

### 3.5 Redeploy an edge function: manual, no button

There is **no workflow that deploys Supabase edge functions**. If the bad change
is baked into `categorize/index.ts`, `appPersona.ts`'s `APP_PERSONA_BASE`, or any
other edge function, this is a laptop task:

```
supabase functions deploy categorize --project-ref ejqsfzggyfsjzrcevlnq
```

Uses the access token, not a DB password. Expect transient Supabase API 502s;
retry with roughly 60s of backoff (LEARNINGS rule 23).

Two rules from the same entry, both of which have bitten before:

- **Never blanket-toggle `verify_jwt` across a deploy.** `config.toml` is the
  register; `xero-callback` and the webhooks are legitimately `verify_jwt=false`
  and everything user-facing is not.
- **Verify by the response body and a functional probe, not the status code.** A
  401 can be correct security. A 200 can be a stale build.

*Time: 1 to 3 min per function, plus retries. Requires a laptop with credentials.*

### 3.6 Revert the code: the slow path

`deploy-worker.yml` (Worker, `site-bubble/**` path filter, `workflow_dispatch`
available) is 4 steps and lands in 2 to 4 minutes with **no test gates**.

`pages.yml` (marketing site, admin, demo, and `apps/app` to Cloudflare Pages)
runs six guards before it builds (`check:css`, `check:tenant`,
`check:definer-guard`, `test:guards`, `check:inference`, `check:judge`,
`check:vendor`) then builds three apps and does two deploys. Realistically 6 to
12 minutes, and the GitHub Pages CDN step alone can take ten on a bad window
(hence `error_count: 30` in the workflow).

`concurrency: group: pages, cancel-in-progress: true` means a second push
**cancels the first**. If you push a revert and then push a fix, the revert may
never deploy. Push once.

---

## 4. Verify the rollback

Do not verify by refreshing the admin UI. It reads the same cached path.

1. **Hit the twin directly** to confirm the config the runtime will read:

   ```
   POST {SUPABASE_URL}/rest/v1/rpc/ai_runtime_inference_config
   ```

   Service role only. This is authoritative; the admin page is not.

2. **Wait 60 seconds**, then confirm real traffic moved:

   ```sql
   select use_case, models, decisions from admin_ai_usecases(1);
   ```

   The `models` array should no longer contain the bad model.

3. **Send one real request** through the affected surface and read the answer.

**The subtlety that will fool you:** on a twin read failure both adapters return
the *last good cache* and do **not** refresh the timestamp. A stale-but-working
config therefore serves indefinitely while the twin is down. So if step 2 does
not move after two minutes, the problem is not your rollback. Check whether
`ai_runtime_inference_config` is erroring, in the edge function logs.

---

## 5. Turn the incident into a permanent test case

An incident that does not become a test is an incident you will have again. Do
this in the same session, before the context is gone.

### If the failure is something a deterministic gate should have caught

`evals/dataset.jsonl` is a labelled JSONL golden set run by `pnpm eval:gates`,
which imports the **real** gate functions from `packages/inference/src/judge.ts`
with no reimplementation. It exits non-zero if any gate misclassifies a labelled
case. Add one line:

```json
{"id":"safe-11","gate":"safety","answer":"<the exact bad answer, verbatim>","expectPass":false}
```

Fields: `id`, `gate` (`safety` | `privacy` | `valid_format` | `source_exists` |
`math`), `answer` or `answerJson`, optional `context.sourceIds`, and
`expectPass`. `expectPass: false` means the gate must BLOCK it.

Run `pnpm eval:gates`. **It should fail.** If it passes, the gate does not catch
this class of failure and adding the row proved nothing. Tighten the gate in
`judge.ts` until the new row fails for the right reason, then make it pass.

`pnpm eval:gates` is not yet a required check on `pages.yml`. Adding it is
tracked in §6.

### If the failure is a schema or contract break

Add it to `packages/inference/test/judge.ts` (`pnpm check:judge`), which **is** a
`pages.yml` gate and therefore blocks the deploy. This is the strongest place to
put a regression test for anything the judge can decide deterministically.

### If the failure is a retention, PII or token-handling break

`packages/inference/test/retention.ts` (`pnpm check:retention`) for policy and
redaction; `supabase/tests/*_test.sql` for anything the database enforces.
`db-tests.yml` runs the pgTAP suite on PRs **and on push to main**. The latter
was added specifically because IQ-2 reached main with its suite never executed.

### Always

Record the incident in `LEARNINGS.md` as a numbered rule if it changed how you
would act, and in `docs/DECISION_LOG.md` if it changed a decision. **Rule 20
applies to every step in §3: prod state that lives outside git must be written
down when you change it.** Every RPC in §3 changes prod state that git does not
see. Note in the PR what you set and what you set it back to.

---

## 6. What this runbook cannot do

Stated plainly so nobody discovers it during an incident.

| Gap | Consequence |
| --- | --- |
| **Nothing alerts.** SUQS `breached`, the ramp step-down recommendation, and the block-rate spike are all dashboard-only. No cron reads them, nothing emails, there is no pager. | Time to detection is however long until someone looks or a customer complains. This is the single biggest weakness in the AI incident path. |
| **No global kill switch for learned rules.** `source in ('rule','vendor_prior')` is HIGH by provenance and ignores `confidence_high`, so §3.1 does not stop it. Only per-rule `deactivate_categorization_rule`. | A bad learned rule keeps autoposting after the confidence kill switch is thrown. |
| **No bulk undo.** `undo_penny_activity` is one entry at a time. | Cleaning up a wide autopost incident is manual and slow. |
| **Edge functions deploy manually.** No workflow, no rollback button. | Any prompt or threshold baked into an edge function needs a laptop with credentials. |
| **`pnpm eval:gates` is not a required CI check.** | A regression case added to `evals/dataset.jsonl` does not block a deploy until this is wired into `pages.yml`. |
| **`final_outcome` and `corrected_at` on `ai_decisions` are dead columns.** Nothing writes them. | "Was this later corrected by the customer or the CPA" cannot be answered from the data, despite the schema implying it can. Do not build a step on them. |
| **The AI Gateway is outside all of this.** Rolling back a prompt does not retract anything already sent to a provider or logged by the gateway. | See [DATA_RETENTION.md](DATA_RETENTION.md) §"What deletion does not reach". |

---

## Quick reference

```sql
-- STOP autoposting (widest, fastest; does not stop rules)
select set_platform_behavior('{"confidence_high": 1.01}'::jsonb);

-- Humans back in the loop
select admin_ai_set_review_mode('penny_chat', 'full', 1.0);

-- What changed
select created_at, action, target_id, payload from admin_audit
 where action like 'ai_%' order by created_at desc limit 20;

-- Revert the model (read the previous payload from admin_audit first)
select admin_ai_model_config_set('penny_chat','anthropic','claude-haiku-4-5-20251001',
  'workers-ai','@cf/meta/llama-3.3-70b-instruct-fp8-fast', false, null);

-- Revert the prompt
select id, version, notes, is_live, created_at from list_prompts();
select set_live_prompt('<last good id>');

-- Verify: what is REALLY running
select use_case, models, decisions from admin_ai_usecases(1);
select * from admin_ai_suqs(1);

-- Restore autoposting when it is genuinely fixed
select set_platform_behavior('{"confidence_high": 0.75}'::jsonb);
```
