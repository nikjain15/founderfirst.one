# User Session Guide — Apr 22, 2026

**For:** Nik (observer)
**Subject:** Real solo freelancer, close persona match to Lindsay/Sails Up
**Format:** 30+ min, she drives the phone, Nik observes
**Goal:** She loves Penny enough to sign up for the beta tonight
**Prepared by:** Head of Research (FounderFirst OS)

This guide is for Nik only — it is NOT part of the Claude Design brief. Wireframe fixes and copy changes live in `BookKeeping/reviews/penny-demo-wireframe-stress-test-apr-2026.md`.

---

## Before she arrives — the pre-session checklist

### The physical setup
- [ ] Load the demo on the device she will hold. If your phone, unlock it and open the demo URL with `?demo=real` to hide wireframe chrome.
- [ ] Clear localStorage so she starts cold at A1 Welcome.
- [ ] Silence notifications on the device.
- [ ] Have a second device / laptop open as fallback with the same demo URL.
- [ ] Have a quiet room. No background movement, no bystanders.

### The technical sanity check (do this 30 min before she arrives)
- [ ] Cold-open the demo. Verify A1 → A7 works end-to-end without a dead tap.
- [ ] Open B1 Penny thread. Send 3 real prompts:
  1. "What were my top 3 expenses last month?"
  2. "What's my cash cushion?"
  3. "If I hired a contractor for $1,200, what would that mean for taxes?"
  Verify all 3 return Penny-voice answers in under 6 seconds. **If any fails, the demo is broken — fix before the session.**
- [ ] Verify B3 re-entry AskBar works (post-fix CR-2).
- [ ] Verify D4 manual entry amount input accepts typing (post-fix CR-3).
- [ ] Verify C5 category picker commits back to C2 (post-fix CR-4).

### The mental prep
- [ ] You are there to **observe, not to sell.** Every time you feel the urge to explain a feature, bite your tongue.
- [ ] Bring a physical notebook. Typing is distracting. Writing down her exact words is what matters.
- [ ] Accept that some screens will fail. Those failures are the research.

---

## The framing you give her (30 seconds — then shut up)

Read this almost verbatim:

> "Thanks for doing this with me. So I've been working on a product called Penny — it's an AI bookkeeper for solo business owners. I have a very early version of it here, and what I'd love to do is hand you my phone and have you just… explore. There's a made-up business in here called Sails Up — a marketing consultant in New Hampshire, similar to your setup — just imagine it's your books for the next 30 minutes. I'll be quiet. If you get stuck or confused, just say it out loud — that's what I want to hear. There's no wrong way to do this. Ready?"

Then: hand her the phone and **stop talking.**

**Do not guide her to a specific screen. Do not narrate. Do not rescue her when she hits a dead end — write it down.**

---

## The 5 prompts (use ONLY if she stalls for 60+ seconds)

Use these one at a time. Give the prompt, then silence. If she stalls again, move to the next.

**Prompt 1 — Set up:**
> "Set it up for your business. Pretend it's really you."

(She'll go through A1–A7. Watch her entity pick, her payment-method picks, and how she reacts to the first approval card.)

**Prompt 2 — Daily review:**
> "Penny just flagged some new transactions. Review the ones at the top."

(She'll likely return to B1 or go into approval cards. Watch what she taps when she's uncertain.)

**Prompt 3 — Month check-in:**
> "It's end of month. You want to know how you did this month."

(She'll navigate to My Books. Watch what she looks at first, and whether the audit-readiness card attracts her.)

**Prompt 4 — Ask Penny something:**
> "Ask Penny something you wish you could ask your bookkeeper."

(This is the magic moment. Watch her face. Write down her exact question and Penny's answer — **this is the most valuable data in the session.**)

**Prompt 5 — New invoice:**
> "You want to send an invoice to a new client."

(She'll navigate to G1 → G2. Watch if she understands the 3-step wizard.)

---

## What to watch silently (fill in during the session)

Keep this one page on your notebook:

| What | Note |
|---|---|
| **First click after A1 Welcome** | |
| **First hesitation (2+ second pause)** — what screen, what was she looking at | |
| **Her exact words for "my books"** (or whatever she calls it) | |
| **Her exact words for Penny** ("the app", "the chat", "Penny") | |
| **Back-button presses** — count and context each | |
| **Which screen she spent longest on** | |
| **Which section she skipped entirely** | |
| **Did she smile at the income celebration (C4)?** | |
| **Did she react to B3 "I kept things tidy"?** | |
| **Did she try to type in a field that doesn't accept typing?** (note which) | |
| **Did she tap a number hoping to drill into it?** (note which) | |
| **Did she tap "Edit" and expect to edit?** (note reaction when it didn't) | |
| **What did she ASK Penny in the chat?** (verbatim — all questions) | |
| **Where did she say "huh" / "wait" / "what does this mean"?** | |
| **Did she ever mention her current bookkeeper or QBO unprompted?** | |
| **What did she laugh at?** | |
| **What did she roll her eyes at?** | |

---

## Questions to ask AFTER she's done exploring

Ask one at a time. Silence after each. Let her finish completely before moving on. Do NOT nod along — just listen.

### Q1 — Describe it back
> "If you had to describe Penny to another freelancer in one sentence, how would you describe it?"

*What you learn:* whether your positioning landed. If she uses your marketing words, your brand has legs. If she describes it in terms of what it replaces ("like an AI QuickBooks," "like a bookkeeper in my pocket"), you have your positioning line.

### Q2 — Current situation
> "Tell me about how you handle your books today. Walk me through what happens when a client pays you or you get a bill."

*What you learn:* her actual workflow, her pain points in her own words, and the specific moments where Penny could slot in. **Do not skip this question.** This is where you learn if Penny actually fits her life.

### Q3 — The conversion trigger
> "What would have to be true for you to use Penny instead of [her current setup]?"

*What you learn:* the real objections. She might say: "it would need to talk to QBO" or "I'd need to trust it with my tax prep" or "I'd want to see it for a full month first." Every answer is a requirement document.

### Q4 — The value moment
> "Can you show me the moment in the last 30 minutes where you felt most 'yes, I want this'?"

*What you learn:* the true value moment. Let her re-navigate — watch which screen she goes back to. That screen IS your hero.

### Q5 — The friction moment
> "Can you show me the moment you felt 'mmm, no' or confused?"

*What you learn:* the friction. She will be polite; make her point at a screen, not just describe a feeling. If she can't find one, push: "surely something wasn't quite right?" She'll tell you.

### Q6 — The trust test
> "What would make you NOT trust Penny with your books?"

*What you learn:* trust objections. Probably: accuracy, security, can-it-replace-my-bookkeeper, what-happens-if-it-gets-it-wrong. Each objection is a design requirement.

### Q7 — The pricing and commitment test (the conversion question)
> "You pay [bookkeeper name] $X/month (if she said so) — if Penny cost half of that, would you drop the bookkeeper?"

*What you learn:* conversion signal. Three possible answers:
- **"Yes, in a heartbeat"** — she's converted. Ask when.
- **"Probably not yet — I'd want to use it for a few months first"** — warm. Offer beta.
- **"No, my bookkeeper does X, Y, Z that this doesn't do"** — cold. What X, Y, Z are is your gap analysis.

---

## The closing ask — the actual conversion moment

Only if Q4 + Q5 show net-positive reaction:

> "I'd like to invite you to be one of our first 10 beta users. No cost, early access. I'll send you an email link tonight. Does that work?"

If she says **yes** — congratulations, you got a signed-up beta user. Send the email within 2 hours.

If she **hesitates** — she did not love it yet, regardless of what she's said out loud. Ask: *"What would need to be true for you to say yes right now?"* Write the answer down. That's your next iteration.

If she says **no** — thank her warmly, and ask: *"If I came back in 3 months with a different version, would you take another look?"* This keeps the door open for segment validation.

---

## Post-session: within 24 hours, write the debrief

Answer these 4 questions in a new file: `BookKeeping/research/solo-freelancer/user-session-01-debrief-apr-2026.md`.

1. **Which 3 screens did she spend the most time on?** → where to invest first.
2. **Which 3 screens did she skip entirely?** → undiscoverable or irrelevant.
3. **What did she ask Penny that Penny couldn't answer?** → eval gap.
4. **Verbatim: what she said when something worked. Verbatim: what she said when something didn't.** → marketing copy + bug list.

Remember: **one session is one data point.** Do not rewrite the product off one user. But do write down what you observed so the pattern shows across 3–5 sessions.

---

## What to NOT ask

- "Would you use this?" (opinion, not behavior — noise)
- "What do you think?" (too open — she'll be polite)
- "Would you pay for this?" (hypothetical — noise)
- Any question that starts with "do you like…"
- Any question that leads: "didn't you love the audit score screen?"

---

## LEARN
The founders who learn most from user sessions are the ones who spend 80% of the session silent. Every time you explain what the user is looking at, you are teaching her the "right" answer — and she will reflect that answer back when you ask her questions later. Your job tomorrow is to be the least interesting person in the room. The phone is the product; she is the user; you are the researcher taking notes.

## NEXT
After tomorrow, the single best question to ask me is: *"Based on what she said and did, what should we change in the product BEFORE we do session #2?"* That's how one session compounds into a research program.
