# Follow-up Agent — v1 Spec

*Plain-language plan. The first "new-user" agent. Built on top of the existing signals pipeline. Keep it small; expand later.*

---

## 1. Why this exists (the problem in one line)

We find prospects and send one message. If they don't reply, the lead silently dies.
**In sales, most conversions come from the follow-up — and right now nobody follows up.**

The Follow-up Agent fixes exactly that one leak, and nothing else. That focus is the point.

---

## 2. What it does (one paragraph)

Once a day, the agent looks for prospects we reached out to but who went quiet. For each one,
it writes a short, friendly, personalized follow-up using the context we already stored about
them (their original post, their pain, their name). It drops the draft into the existing Leads
drawer marked "needs review." **It never sends anything on its own** — you approve every message,
exactly like today. Everything reuses what we already have: the same worker, the same draft
function, the same drawer, the same audit log.

---

## 3. The funnel this fits into (the bigger picture, simple)

```
AWARENESS       INTEREST       TRIAL        ADOPTION     USAGE       HAPPY
found them  →  they replied → signed up → first "aha" → using it → fan/referral
   ✅ have       ✅ have         🆕 later     🆕 later     🆕 later    🆕 later
        \________ Follow-up Agent lives here _______/
         (nudges people stuck between "sent" and "replied")
```

One person = one record (`sig_leads`) that moves forward through stages and is never dropped.
This agent is the first one to actively *push* people forward instead of waiting.

---

## 4. Scope — what we build now vs. later

### Build now (v1)
1. **Schema:** add 4 new stages + 4 small columns to the existing `sig_leads` table.
2. **Worker:** one daily "follow-up sweep" function inside the existing signals worker
   (no new server, no new infrastructure).
3. **UI:** the new stages appear in the existing Leads drawer dropdown, plus a
   "Needs follow-up" filter so you can find the queued drafts.

### Deliberately NOT now (so we don't over-build)
- Auto-sending without approval.
- Linking a lead to their real Penny account / tracking actual product usage.
- The adoption/usage/happy automation (those stages exist as labels but stay manual for now).
- Referral / advocacy agent, morning brief, etc.

These all plug into the *same record* later. We earn them by proving v1 works.

---

## 5. Schema changes (the whole change — small)

### New stages on `sig_leads.stage`
Existing: `new, reviewing, drafted, sent, replied, won, dead`
Add: `signed_up, activated, active, happy`
(`won` kept as alias for `signed_up` so nothing breaks.)

### New columns on `sig_leads`
| Column | Type | Meaning |
|---|---|---|
| `penny_user_id` | uuid, nullable | Links to real Penny account once they sign up (used later) |
| `next_followup_at` | timestamptz, nullable | When the agent may next nudge them |
| `followup_count` | int, default 0 | How many follow-ups sent (so we never pester) |
| `last_touch_at` | timestamptz, nullable | Last time anyone/anything contacted them |
| `followup_recipe` | text, nullable | Per-lead rhythm override (null = use central default). See §10 |
| `followup_paused` | boolean, default false | Freeze follow-ups for this lead without killing it |
| `snooze_until` | timestamptz, nullable | Don't follow up before this date |

That is the entire schema change.

---

## 6. The daily sweep — exact logic

Runs once per day inside the signals worker. The recipe (per-lead or central default)
decides timing and max count — see §10.

```
candidates = leads WHERE stage = 'sent'
             AND followup_paused = false
             AND (snooze_until IS NULL OR snooze_until <= now())
             AND intent >= central.quality_gate          # weak leads get none
             AND followup_count < recipe.max_steps        # recipe lifetime cap
             AND due_per_recipe(lead)                      # right time per recipe rhythm

order candidates by intent DESC, take top central.daily_cap   # anti-flood ceiling

FOR each chosen lead:
  1. Build context from the lead's stored item (original post, pain_tags, contact_name)
     + the history of what we already said.
  2. NEW-ANGLE GATE: ask the model "is there something fresh/valuable to add?"
     If no -> skip, set next_followup_at = +recipe gap, log 'followup_skipped_no_angle'.
  3. Draft a short follow-up via the existing Claude draft() function
     (references prior message, adds the new angle, soft CTA, never guilt-trips).
  4. Save the draft (reuse sig_set_lead_draft), set stage -> 'drafted',
     increment followup_count, set last_touch_at = now(),
     set next_followup_at = now() + recipe.gap_for(next step).
  5. Log a 'followup_drafted' event to sig_lead_events.
```

Result each morning: a short queue of ready-to-review follow-ups in the Leads drawer.
You tap approve/edit/send. Nothing leaves without you.

---

## 7. Guardrails (control + safety)

- **Approval required.** Agent only drafts; you send. (Your chosen mode.)
- **Max 2 follow-ups** per lead, ever (v1). No spam.
- **Min 3 days** between the original send and the first follow-up; 4 days between follow-ups.
- **Skips replied/won/dead leads** automatically (only touches `sent`).
- **Full audit trail** via `sig_lead_events` (already standard in this system).
- Built in an **isolated worktree, small atomic commits**, PR for review — per repo rules.

---

## 8. How we'll know it works (one metric)

**Reply rate on followed-up leads vs. leads with no follow-up.**
If follow-ups produce extra replies, the agent is paying for itself. That single number tells us
whether to expand (more follow-up steps, then auto-send, then the next agent).

---

## 9. Build steps (order)

1. Migration: stages + 7 columns (+ keep `won` alias) + central policy row in `sig_settings`.
2. Worker: `followupSweep()` function (recipe-aware) + wire into the daily cycle.
3. Admin — central: a "Follow-up Policy" card in the Scoring/Settings tab (§10).
4. Admin — per-lead: a "Follow-up" section in the Lead drawer (§10).
5. Verify: dry-run the sweep against real `sent` leads, eyeball the drafts + that caps hold.
6. Ship behind your approval; watch the reply-rate metric for a week.

---

## 10. Customization — central + per-lead (the anti-spam design)

The whole goal here: **never create too many follow-ups.** Two dials (central default,
per-lead override) plus a budget-aware agent that *structurally cannot* flood.

### The core idea: "Follow-up Recipes" (named rhythms, not fiddly numbers)

Instead of setting day/count numbers per lead, you pick a named recipe. Each recipe = a
small fixed rhythm with a hard lifetime cap.

| Recipe | Rhythm | Max steps | Use for |
|---|---|---|---|
| 🌱 Gentle | 1 nudge after 5 days | 1 | Lukewarm leads |
| 🔁 Standard *(default)* | nudge after 3d, then 5d | 2 | Most leads |
| 🔥 Persistent | nudge after 2d, 3d, 5d | 3 | Hot, high-intent leads |
| 🚫 None | never follow up | 0 | Bad fit / handle manually |

Recipes are defined once (in `sig_settings`, easy to tune later, no code change).

### Layer 1 — Central policy (set once; one row in `sig_settings`, key `followup_policy`)
Shown as a "Follow-up Policy" card in the Scoring/Settings tab:

| Control | What it does |
|---|---|
| **Master switch** | Turn the whole agent on/off instantly |
| **Default recipe** | Rhythm new leads get (e.g. Standard) |
| **Daily cap** (N) | *Anti-flood seatbelt* — draft at most N/day; if more qualify, take the top N by intent, rest wait |
| **Quality gate** (min intent) | Leads below this score get ZERO follow-ups |
| **Quiet rule** | Never touch replied/won/dead (always on) |

### Layer 2 — Per-lead override (a "Follow-up" section in the Lead drawer)

| Control | What it does |
|---|---|
| **Recipe dropdown** | Inherits default; change for this one lead |
| **Pause toggle** | Freeze follow-ups without killing the lead (`followup_paused`) |
| **Snooze until [date]** | Don't bug them before this date (`snooze_until`) |
| **Skip next** | Drop just the upcoming follow-up |
| **Readout** | "Next follow-up: Jun 28 · 1 of 2 sent" — always see what's coming |

### The creative brake: the "new-angle" gate
Before drafting, the agent asks itself: *"Do I actually have something fresh/valuable to
say?"* If not, it **skips and waits** instead of sending filler. Empty "just following up"
messages are what make outreach feel like spam — so we gate on having a real reason.

### Why it structurally cannot flood (five independent brakes)
1. **Quality gate** → weak leads get none.
2. **Daily cap** → hard ceiling on total volume per day.
3. **Recipe max steps** → fixed lifetime # per lead.
4. **New-angle gate** → no filler messages.
5. **Approval required** → nothing sends without you.

---

## 11. Draft content & voice control (so nudges are on-brand, never salesy)

**Goal:** you control exactly what a nudge sounds like, see it before it goes live, and it
always follows brand voice. Nothing about the message is hidden in code.

### Two editable layers (no code changes to tune either)

1. **Brand voice — already exists.** `penny_voice` table, edited at `/admin/content#voice`,
   versioned + live, shared by Penny and all outreach. The worker already prepends it to every
   draft (`get_live_voice()`). Follow-ups inherit it automatically → one source of truth, no drift.

2. **Follow-up content guide — NEW, editable.** Today the follow-up-specific rules would be
   hardcoded in `brain.mjs`. Instead we move them into an editable settings field
   (`sig_settings` key `followup_content`), shown in the Follow-up Policy card. Plain English:
   - The guide text, e.g. *"Warm, peer-to-peer, never salesy. Lead with one genuinely useful
     tip about THEIR problem. Reference what we said before. One soft, low-pressure next step.
     If there's nothing helpful to add, send nothing."*
   - **"Never say" list** — banned phrases: *"just checking in", "circling back", "quick
     follow-up", "did you see my message", "we help businesses like yours"*. The draft must
     avoid these (kills the spammy patterns at the root).
   - **Length cap** (e.g. < 60 words).
   - *(Optional)* per-recipe note: Gentle = "pure value, zero ask"; Persistent = "a bit more direct".

A follow-up draft = `penny_voice` (brand) + `followup_content` (these rules) + the lead's
context + prior-message history. Both layers are user-editable; none are hardcoded.

### Preview before live (the "so I know what we have" feature)
A **"Preview sample nudge"** button in the Follow-up Policy card. Runs the real draft pipeline
against a sample (or a chosen real stalled lead) and shows the actual message — **no send, no
save.** Edit guide → preview again → see it change. Tune tone until happy, then enable the agent.

### Build impact (still small)
- Move follow-up rules out of `brain.mjs` into the `followup_content` settings field.
- Reuse `penny_voice` as-is.
- Add to the Policy card: a guide text area, a banned-phrases field, and a Preview button
  (Preview calls a draft RPC in dry-run mode — no DB write).

---

*Next agent after this proves out: a "Warm-greeter" that personalizes Penny's first message for
people who arrive from our outreach — the next door down the hallway.*
