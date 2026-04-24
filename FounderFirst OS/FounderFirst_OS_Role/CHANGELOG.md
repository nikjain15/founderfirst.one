# FounderFirst OS — Changelog
*Updated: 12 April 2026*

---

## 12 April 2026 — Philosophy overhaul: CEO authority + HANDOFFS

### Core philosophy change

**Before:** Roles acted as gatekeepers — "I refuse," "do not do X," "non-negotiable." Roles pre-decided architecture and approach based on assumed solo-founder constraints (e.g., "no microservices ever," "6-week scope limit," "no paid ads").

**After:** Roles advise; the founder decides. Every role now:
- Asks follow-up questions before starting work
- Presents the best solution for a scalable, trusted, loved product — without constraining by team size or resources
- Gives strong opinions with trade-offs, never gatekeeps options
- Does exactly what is asked — concise, no extra work
- Defers final authority to the founder (CEO)

### Files changed

**IDENTITY.md** — Standing rules rewritten with 4 sections: Authority (founder is CEO), Before You Start (ask first), Quality of Thinking (best solution, trade-offs not gatekeeping), Output Discipline (concise, do what's asked).

**README.md** — Updated header, added "How Every Role Works" section with 5 universal rules.

**All 8 role files** — Consistent changes across every role:
- "My non-negotiables" → "My principles" — same strong opinions, framed as advice not law
- Added activation header: "How to activate / When to call me / What I deliver"
- Added "I ask before I build" as first behaviour rule
- Added "I give strong opinions, loosely held" — pushes back, presents trade-offs, founder decides
- Added "I am concise" — does exactly what's asked
- Added HANDOFFS section — what each role receives from and delivers to other roles
- Removed all "I refuse / I stop you / I reject / do not ask" language
- Removed all solo-founder resource constraints from recommendations

**Specific constraint removals:**
| Role | Removed constraint | Replaced with |
|---|---|---|
| CTO | "No microservices, no Kubernetes ever" | "Design the system the product needs — present trade-offs, founder decides" |
| CTO | "If it can be faked for 50 users, do not build it" | "Validate before building — recommend testing approaches, don't constrain target architecture" |
| CPO | "v1 in 6 weeks solo or scoped wrong" | "Scope driven by value moment, not resource constraints" |
| CMO | "Paid ads off the table until 100 users" | "WOM-first, present all channel options with trade-offs" |
| Design | "Can one person build this in a day?" | "Best user experience — trustworthy, delightful, scalable" |
| COO | "Do not build a system for something done fewer than 10 times" | "Flag when process is not yet stable, founder decides" |

### HANDOFFS added

6 cross-role handoff paths now documented:
1. Research → CPO (segment validation → build order)
2. Research → CMO (ICP + customer language → channel strategy)
3. CPO → CTO (scope + sequence → architecture)
4. CPO → Design (value moment + scope → user flows)
5. CTO → Legal (stack + data flow → compliance)
6. CMO → CFO (positioning + alternatives → pricing)

### Cross-file updates

- `CLAUDE.md` — Added Section 0 (working principles), Section 0.5 (OS system reference), rewritten Section 10 (guardrails with trade-off language), added session log entry
- `STATUS.md` — Added FounderFirst OS file inventory, dashboard file inventory, updated "Where We Are"

---

## Previous changes

---

## What changed and why

### IDENTITY system — now project-specific

**Before:** One `IDENTITY.md` file for everything.
**After:** `IDENTITY.md` is a blank template. Each project gets its own file (`IDENTITY_penny.md`, etc.). Roles are generic experts — the IDENTITY file makes their advice project-specific.

**Why:** Different projects have different customers, stages, and locked decisions. A bookkeeping product for sole proprietors needs different advice than whatever comes next.

**Files:**
- `IDENTITY.md` — template with instructions
- `IDENTITY_penny.md` — filled in for Penny (stage: Build, 3 customer segments, 8 locked decisions, all known evidence, current blockers)

---

### Penny target market — 3 segments documented

The IDENTITY_penny.md file has the correct 3 segments in priority order:

1. Solo service provider (freelancer/consultant) — MVP persona: Alex
2. Product-based seller (e-commerce or retail)
3. Local service business (plumber, salon, cleaner)

All US sole proprietors. Alex (segment 1) is the MVP user. Segments 2 and 3 are documented as future — persona docs for them do not exist yet and that is flagged as an open question.

---

### All 8 roles — rewritten to best-of-best caliber

Every role was rewritten. The upgrade was not just adding years of experience — it was changing the kind of experience to match the best person alive at that job.

| Role | Before | After |
|------|--------|-------|
| **CTO** | 22 years software, 6 years AI. Senior startup CTO. | Built ML systems before transformers. Joined a frontier AI lab. Shipped AI products to hundreds of millions of users. Knows model serving, evaluation, prompt systems, and cost management at scale. |
| **Head of Research** | 3 startups that reached PMF, watched 12 fail. | 16 years studying startup success/failure. Built customer research at a $2B company. Reviewed 4,000+ startup ideas. 2,000+ personal customer interviews. |
| **CPO** | 4 companies to $1M ARR. | 18 years in product. CPO at a company that became the category definition. Three 0-to-1 products that reached $100M+ ARR. |
| **CMO** | 3 products to 10k users without paid. | 15 years in growth, last 10 WOM-only. First marketing hire at a product that grew to 2M users purely through WOM. |
| **CFO** | Helped 6 early-stage founders. | First finance person at 5 companies, 3 reached $100M+ ARR. Seen both bootstrap and fundraised paths. |
| **COO** | Helped 4 solo founders transition. | Joined a company at 15 people, built ops infrastructure to 3,000. First ops hire at two companies that scaled past 500. |
| **Head of Design** | 18 years, 5 in AI. | 20 years designing products, last 7 on AI-native interfaces. Led design at a company that became a design reference point. Only designer for first 18 months at two companies that scaled to millions. |
| **General Counsel** | 14 years, last 5 on AI. | 16 years as tech legal counsel, last 7 at AI companies. Was GC at a company processing sensitive data through AI at scale. Helped write policies that became industry templates. |

**What stayed the same across all roles:** the LEARN/NEXT/CRITIC patterns, the "in character all session" behaviour, the pushback behaviour, the standing rules from IDENTITY.

**What changed in content (not just bios):**
- CTO gained: AI product architecture principles, model migration design, evaluation frameworks, production failure modes with fixes, cost tracking
- Research gained: Skill 4 (Segment Validation) — for products serving multiple customer segments
- CPO gained: Skill 4 (Multi-Segment Product Strategy) — deciding which segment defines v1 and when to expand
- Other roles: bios upgraded, skills tightened, no structural additions needed

---

### New roles added

| Role | File | Why |
|------|------|-----|
| **Head of Design** | `role_design.md` | Penny is a conversational AI product on mobile. Interface design is the product. Needed: AI interface patterns, user flow design, design systems for solo founders, design validation. |
| **General Counsel** | `role_legal.md` | Penny handles financial data through AI. Legal surface is real: AI liability, data privacy, bank feed compliance, terms of service. Needed: pre-launch legal minimum, AI-specific issues, data handling, contracts. |

---

### Dashboard — nightly scoring now live

The scheduled task (`founderfirst-os-scorer`, 9pm daily) was updated with a detailed prompt that reads real session transcripts, scores each against the 6 levers, and writes live data to `daily-log.json`. No more hardcoded sample data.

**Action needed:** run the task manually once to pre-approve tool permissions so future nightly runs do not pause.

---

## File inventory after changes

```
FounderFirst_OS_Role/
├── IDENTITY.md              ← project template (blank)
├── IDENTITY_penny.md        ← Penny project context (filled)
├── README.md                ← updated (10 files, multi-project setup)
├── CHANGELOG.md             ← this file
├── role_research.md         ← rewritten
├── role_cpo.md              ← rewritten
├── role_cto.md              ← rewritten
├── role_design.md           ← new
├── role_cmo.md              ← rewritten
├── role_cfo.md              ← rewritten
├── role_coo.md              ← rewritten
└── role_legal.md            ← new
```
