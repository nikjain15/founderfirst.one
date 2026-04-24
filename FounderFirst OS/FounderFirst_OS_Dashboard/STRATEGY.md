# FounderFirst OS
*Last updated: April 2026*

---

## What it is

FounderFirst OS is a personal operating system for tracking how effectively AI is being used to build products.

- **Built for founders** — specifically for people building products that help other founders focus on their core business, not on ops and admin
- **Fully automatic** — at the end of each day, Claude reads through all sessions, scores them, and updates the dashboard. Nothing to fill in
- **One goal** — get measurably better at using AI as a building tool, week over week

---

## The 6 Levers

Six inputs drive token cost and output accuracy. Each one is binary — present or not. Claude detects all six from the session transcript.

| # | Lever | What it means |
|---|---|---|
| 1 | **Context Setup** | Did the session start with reading CLAUDE.md? |
| 2 | **Goal Clarity** | Was the opening message specific with a clear deliverable? |
| 3 | **Decision Lock** | For build sessions — were decisions settled before building started? |
| 4 | **Format Precision** | Did any message specify how the output should look? |
| 5 | **Batch Thinking** | Were related asks grouped, or scattered across many messages? |
| 6 | **Session Close** | Did the session end with CLAUDE.md or STATUS.md updated? |

---

## How it works

Every session is saved as a transcript. At 9pm daily, Claude:

1. Reads all transcripts from that day
2. Checks each one against the 6 levers
3. Scores each session (0–100)
4. Writes results to `daily-log.json`
5. The dashboard reads that file and renders everything

---

## The Dashboard

Three views.

**Today** — today's average score, sessions logged, weakest lever, one insight

**My Levers** — 6 lever bars showing compliance % over last 14 days, with a plain-English action for the weakest one

**Trend** — session scores over last 14 sessions, week-on-week comparison, most-improved lever

---

## Design

Follows FounderFirst design language.

- Background `#F7F7F5` · Cards `#FAFAFA` · Borders `#E0E0E0`
- Text `#111` / `#333` / `#888` · Accent (hi-fi) `#2C5F8D`
- Typography: titles 17px/700 · hero number 36px/700 · body 14–15px/400 · labels 11px/700 uppercase
- Icons: minimal geometric SVGs, 1.5px stroke, no fill — OpenAI/Stripe quality
- Voice: plain English, one insight at a time, lead with the finding

---

## Architecture

```
FounderFirst/
  FounderFirst OS/
    README.md            ← this file
    daily-log.json       ← written by scheduled task each night
    founderfirst-os.html ← the dashboard
```
