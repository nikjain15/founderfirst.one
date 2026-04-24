# Penny — Research Strategy by Sub-Segment
**Role: Researcher · Standard: Evidence-only · Assumptions stated explicitly**
*Last updated: 2026-04-12*

---

## How to Use This Document

This is a research *strategy* — not findings. It defines what to go find, why it matters for Penny's decisions, and how to go find it. Each segment gets a research brief. Read the constraints first.

---

## Constraints That Shape This Strategy

From `IDENTITY_penny.md` — these are locked. Research works within them.

| Decision | Impact on Research |
|---|---|
| **US only (Decision #4)** | Digital Nomads (Segment 6) is out of scope for Penny v1. No research budget goes there. |
| **MVP = Alex, solo service provider (Decision #5)** | Segments 1–3 (creatives, tech, consultants) are the validation zone. Segment 4 (coaches) is adjacent. Segment 5 (gig) is a long-term question, not now. |
| **Word-of-mouth only (Decision #6)** | Every segment brief must answer: "Where do these people talk to each other?" If the answer is weak, the segment is weak for Penny — even if pain is high. |
| **Conversation is the UX (Decision #3)** | Research must surface: "What does Alex say out loud about money?" — not just what she does. The voice of the customer is the product input. |

---

## The Master Research Question

Before spending time on any segment:

> **Which sub-segment of the solo service provider has the sharpest, most specific, most monetisable bookkeeping pain — and talks to their peers enough to generate word-of-mouth?**

Everything below exists to answer that question.

---

## Segment 1: Creative Freelancers
**Who:** Designers, illustrators, photographers, videographers, writers, content creators

### Why Research This Segment
Creatives are the *loudest* freelancers online. They dominate r/freelance, design Twitter, and Dribbble forums. Their pain is high and their voice is public — meaning Penny's word-of-mouth hypothesis can be tested faster here than anywhere else. The risk: they have the lowest willingness to pay. Research must answer whether their pain is sharp enough to overcome price sensitivity.

### The Core Unknown
Do creatives abandon bookkeeping tools because the tools are bad, or because they fundamentally don't want to engage with money? These are different problems. One is a UX problem (Penny can solve it). The other is a motivation problem (Penny can't fix apathy).

### Research Methods — In Priority Order

**1. Community Listening (do this first, it's free)**
- Where: `r/freelance` (850K members), `r/graphic_design`, `r/freelancewriters`, `r/photography`
- What to look for: posts that mention tax, invoice, receipt, QuickBooks, Wave, accountant, "owe the IRS," "how do I track." Sort by Top, All Time, then filter to last 12 months.
- What to record: post title, upvote count, direct quotes from posts and top comments, URL
- Time: 3–4 hours native browsing. Cannot be automated — Reddit blocks fetch.
- Why before interviews: You want to know what they *voluntarily* say about money before you ask them directly. Unprompted language is more honest.

**2. 5 Qualitative Interviews — "Walk me through the last time you dealt with your finances"**
- Who: Freelance designer or writer, 2–6 years in, sole proprietor, US, $40K–$100K revenue
- Where to recruit: Post in r/freelance ("looking to chat with designers/writers about finance tools, 30 mins, $20 Amazon gift card"), or tap personal network
- What NOT to do: Do not show a product. Do not say "bookkeeping app." Do not suggest a price.
- The one question that matters most: *"What did you do the last time you realized you needed to deal with your business finances? Walk me through exactly what happened."*
- What to listen for: The specific trigger moment. The tool they opened first. The moment they gave up. The emotion they describe.
- Record verbatim. Quote everything. Do not paraphrase.

**3. The WTP Test (only after interviews — sequence matters)**
- Show a single-screen mockup of Penny's core view ("Here's your real take-home this month: $3,240. Set aside $810 for taxes.")
- Ask: "If this existed on your phone and worked, what would you pay for it per month?"
- Do not suggest a number first. Record their number verbatim.
- Do this with at least 5 people. The range is more valuable than the average.

### Key Questions to Answer
1. At what moment does a creative freelancer feel the financial pain most acutely? (April panic? A specific client payment? The first quarterly deadline they miss?)
2. What tool, if any, did they try before giving up? Why did they give up?
3. What language do they use to describe their financial situation? (This is Penny's copy.)
4. What would they pay per month for a tool that "just handles it"?
5. Who do they talk to about this — and where?

### What This Research Decides for Penny
If creatives show sharp moment-of-pain + WTP ≥ $15/mo + active peer communities → they belong in the MVP alongside Alex. If WTP is $0–$5 and the dominant answer is "I just use my accountant for $300 in April" → deprioritise and don't build for them.

---

## Segment 2: Tech Freelancers
**Who:** Software developers, engineers, UX/UI designers (with engineering background), data scientists

### Why Research This Segment
Tech freelancers earn more, are more tool-comfortable, and are more willing to pay for software. They are also the most credible word-of-mouth vector for Penny — a dev recommending a tool on Twitter or Hacker News carries more weight than most. The risk: they may already have a workaround (spreadsheet + accountant) that's "good enough."

### The Core Unknown
At what income level or complexity level does the tech freelancer's current workaround break down? Until it breaks, they will not switch. Research must find where the seam is.

### Research Methods — In Priority Order

**1. Hacker News + Twitter Observation**
- Search Hacker News: `bookkeeping freelancer`, `tax freelance`, `self-employed accounting`, `QuickBooks alternative`
- Search Twitter/X: `freelance taxes` `solo developer bookkeeping` `self-employed tax` filtered to people with dev-adjacent bios
- Look for: complaints about existing tools, questions about when to get an accountant, S-Corp confusion, quarterly tax stress
- Record: tweet/post URLs, follower counts (proxy for reach), specific language used

**2. 5 Qualitative Interviews — "Tell me about your current system for tracking business income and expenses"**
- Who: Freelance dev, 1–8 years independent, sole prop or single-member LLC, US, $80K–$250K
- Where to recruit: r/webdev, r/cscareerquestions, local dev Slack communities, Toptal/Contra communities
- The opening that matters: *"Tell me about your current system for tracking business income and expenses. Not what you think you should be doing — what you actually do."*
- What to probe: When did they last look at their books? What does "looking at their books" mean to them? Have they been surprised by a tax bill? Do they know their real net income right now?
- The S-Corp question: "Have you ever thought about switching to an S-Corp? What stopped you?" — this reveals financial sophistication and pain.

**3. Forum Survey (optional, after interviews)**
- If interviews reveal consistent themes, a 5-question survey posted to r/webdev or r/freelance can validate scale
- Keep it under 3 minutes. Offer nothing in return — short surveys with no incentive get more honest answers in these communities.

### Key Questions to Answer
1. Does the tech freelancer's pain live in *tax complexity* (S-Corp timing, deductions) or *daily tracking* (expenses, invoices)? These require different products.
2. What does their current system actually look like, in detail? (Spreadsheet + which columns? Wave + how often do they open it?)
3. What is the specific moment their workaround breaks? (Tax filing? A big client payment? Year-end?)
4. What would they pay per month? Is their price anchor above or below $20?
5. Do they recommend financial tools to peers? (Word-of-mouth proxy)

### What This Research Decides for Penny
Tech freelancers are the segment most likely to become Penny's early adopters *and* loudest advocates, because they're online and opinionated. If research confirms WTP ≥ $20/mo and active word-of-mouth behaviour → this is Penny's launch community. If they already feel "handled enough" → they're a later segment, not MVP.

---

## Segment 3: Independent Consultants
**Who:** Strategy, marketing, HR, finance, operations consultants — typically ex-corporate, 5+ years experience, billing $150–$400/hour

### Why Research This Segment
This segment has the highest income, the most complex books (travel, client entertainment, subcontractors), and the highest willingness to pay. The risk: many in this segment have already hired a bookkeeper or CPA. Research must find the gap *before* they hire help — and whether Penny can serve them even after they have a CPA (as the "organised layer" that makes the CPA cheaper).

### The Core Unknown
At what revenue point does a consultant hire a bookkeeper? And what does their financial life look like *before* that threshold? That pre-hire period is Penny's window.

### Research Methods — In Priority Order

**1. LinkedIn Observation**
- Search LinkedIn posts for: "freelance consultant taxes," "independent consultant bookkeeping," "solopreneur finance," "left corporate"
- Look for: public posts about financial stress, CPA bills, tax confusion
- LinkedIn is less anonymous than Reddit — people self-censor. Treat observations as directional, not confirmatory.

**2. r/consulting + r/Entrepreneur Community Listening**
- `r/consulting` (130K members): search "taxes," "bookkeeping," "accounting," "QuickBooks"
- `r/Entrepreneur`: search same terms filtered to self-employed / consultant threads
- Record: direct quotes, upvote counts, URLs

**3. 5 Qualitative Interviews — "When did you last know exactly what your business was making?"**
- Who: Independent consultant, ex-corporate, $100K–$400K revenue, US sole prop or LLC, 1–5 years independent
- Where to recruit: LinkedIn ("I'm researching financial tools for consultants — 30 min chat?"), r/consulting
- The question that opens everything: *"When did you last know exactly what your business was making — net, after expenses and taxes? How did you find out?"*
- What to probe: How do they track project profitability? How do they know if a client is worth taking? How do they feel in the 2 weeks before quarterly taxes?
- The CPA question: "Do you use a CPA or bookkeeper? When did you start? What triggered it?" — reveals the threshold.

**4. Willingness to Pay — Higher Anchor Test**
- For this segment only: test a higher price point. After showing the same mockup as Segment 1, ask the WTP question.
- If they say "$30+" unprompted → this segment can sustain Penny's higher tier.

### Key Questions to Answer
1. What's the threshold (income or complexity) at which a consultant hires a bookkeeper, and what happens just before?
2. Do consultants want a tool or do they want a human? Is "AI bookkeeper" reassuring or threatening to them?
3. What does "clean books" mean to a consultant — is it a professional signal (showing clients a P&L) or a personal relief?
4. What's their CPA bill, and does Penny reduce it or complement it?
5. Do they talk to peers about tools? (r/consulting has strong peer recommendation culture)

### What This Research Decides for Penny
If WTP is ≥ $40/mo and the pain is pre-CPA → consultants are Penny's premium tier, not MVP tier. Design the core product for Alex, but build the pricing ladder knowing consultants will pay more for cleaner reporting. If they all say "I just use my accountant" → they're not Penny's user, they're Penny's partner channel.

---

## Segment 4: Service Solopreneurs
**Who:** Life coaches, therapists, personal trainers, nutritionists, tutors — session-based, recurring clients

### Why Research This Segment
This segment is massive and underserved. Their specific problem (income across 4–6 payment platforms: Venmo, Stripe, PayPal, Square, Cash App, Zelle — all in the same month) is one that no existing tool handles elegantly. The risk: they have low WTP *and* low financial motivation. Research must answer whether the pain is sharp enough to create pull, or whether it's a chronic dull ache they've learned to live with.

### The Core Unknown
The platform fragmentation problem (Venmo + Stripe + PayPal all at once) *sounds* like a sharp pain from the outside. Is it actually sharp to them — meaning they'd pay to solve it — or have they simply accepted it as the cost of doing business?

### Research Methods — In Priority Order

**1. Facebook Group Observation (critical for this segment — they are not on Reddit)**
- This segment primarily lives in Facebook groups, not Reddit. Reddit skews male/technical. Coaches and therapists skew female and use Facebook communities heavily.
- Groups to observe: "Coaches who want to get paid" (180K+), therapist private practice groups, personal trainer business groups
- Search within groups: "taxes," "invoicing," "bookkeeping," "how do you track," "Venmo business," "QuickBooks"
- Note: You need to be a group member to search. This is manual work — cannot be automated.
- Record: exact post text (anonymised), comment patterns, emotional language

**2. 5 Qualitative Interviews — "How do you know how much money your business made last month?"**
- Who: Solo coach, therapist, or trainer — US, sole prop, $40K–$120K, 2–7 years in practice
- Where to recruit: Facebook groups (message directly), Instagram DM (this segment is active on Instagram)
- The question that opens everything: *"How do you know how much money your business made last month? Walk me through what you actually look at."*
- What to probe: How many payment apps do they use? Have they ever had to reconcile across platforms? Do they know what they owe in taxes right now? Have they ever been surprised by a tax bill?

**3. Platform Fragmentation Test**
- Specific to this segment: ask them to list every platform a client has paid them through in the last 90 days. Count them.
- If the average is 3+ platforms → fragmentation pain is real and specific. This becomes a testable product claim.
- If most say "I just use Stripe" → the fragmentation story is not the angle.

### Key Questions to Answer
1. Is the multi-platform income problem a sharp pain or a dull ache — measured by whether they've ever tried to solve it?
2. Do therapists and coaches identify as "business owners" or "practitioners"? (Identity shapes product framing — "your business finances" vs. "your practice income")
3. What is their actual WTP? This segment likely lands at $10–$20/mo. Is that enough for Penny?
4. Do they recommend tools to peers? (Facebook groups have strong recommendation culture — this is a yes if the product is simple enough)
5. Is their pain seasonal (April tax panic) or year-round?

### What This Research Decides for Penny
If platform fragmentation is confirmed as a sharp pain → this segment might need a dedicated feature (multi-source income reconciliation) that gets built into the core product. If WTP is $10–$15/mo → they belong in Penny's base tier, not as the launch wedge but as a strong second wave. If they don't identify as business owners → Penny's copy needs to change for them.

---

## Segment 5: Gig Economy Workers
**Who:** Uber/Lyft drivers, DoorDash/Instacart couriers, TaskRabbit, Airbnb hosts

### Why Research This Segment

**Honest assessment:** This segment is *not* Penny's MVP market. Their pain is extreme but the product economics don't work — WTP is $0–$10/mo, churn is high, and the product they need (mileage tracking + multi-1099 reconciliation) is narrower than what Penny is building. Research here is a one-time sizing exercise only, not a build signal.

### Why Do It At All
The gig economy is massive (20M+ people in the US with material 1099 income). Understanding why Penny doesn't serve them well now sharpens what Penny is actually optimised for. And there may be a future Penny tier that does serve them.

### Minimal Research Method
- **One only:** Read existing public research. Everlance, Stride, and Hurdlr have all published data on gig worker financial behaviour. Read their reports (they're public — linked below is the search path).
- Do *not* spend time on interviews or community listening for this segment at this stage.
- Record: mileage tracking behaviour, average 1099 count per gig worker, WTP data if available

### Search Path for Existing Research
- Everlance mileage tracking report: search "Everlance gig economy report mileage tracking statistics"
- Stride annual report: search "Stride Health gig economy report 2024"
- IRS 1099-K threshold change impact: search "1099-K $600 threshold gig workers impact 2024"

### Key Question (one only)
Is there a future where Penny adds a "gig mode" as a low-cost tier, or is this a permanently separate product category?

### What This Research Decides for Penny
**Nothing for the MVP.** This research is defensive — it confirms Penny's current focus is right. File findings and revisit after first 100 users.

---

## Segment 6: Digital Nomads / International Freelancers

**This segment is out of scope.**

Decision #4 (US market only) is locked. Research here would produce findings Penny cannot act on. No budget, no time.

*If Decision #4 is ever reopened (say REOPEN 4), digital nomad research becomes high priority — their pain is extreme and their WTP is high.*

---

## Research Prioritisation — Where to Start

| Priority | Segment | Why First | Time Estimate |
|---|---|---|---|
| **1** | Tech Freelancers (S2) | Highest WTP + strongest word-of-mouth vector + most likely to be Penny's launch community | 2 weeks |
| **2** | Creative Freelancers (S1) | Loudest online presence → community listening is fast and cheap | 1 week (listening) + 2 weeks (interviews) |
| **3** | Independent Consultants (S3) | Highest WTP ceiling + informs premium tier pricing | 2 weeks |
| **4** | Service Solopreneurs (S4) | Platform fragmentation hypothesis to test — high upside if confirmed | 2 weeks |
| **5** | Gig Economy (S5) | Desk research only — confirm it's not the MVP target | 3 hours |
| **OUT** | Digital Nomads (S6) | Locked decision #4 | — |

---

## What Good Research Output Looks Like (the standard)

For each segment, the output of research must answer these five questions with evidence — not assumptions:

1. **The moment of pain:** What is the specific trigger that makes this person feel financial stress? (Not "taxes are hard" — "the Sunday before April 15th when she opens her bank app and realises she has no idea what she owes")
2. **The current workaround:** What does she actually do today? (Be specific — "opens a Google Sheet she last updated in January")
3. **The abandonment point:** At what step in an existing tool does she give up? (Be specific — "when QuickBooks asks her to pick an account type")
4. **The words she uses:** Direct quotes, unparaphrased. These become Penny's copy.
5. **Her number:** What she says, unprompted, when asked what she'd pay. Record verbatim.

Anything less than this is not usable research for a product decision.

---

## Standing Rules for This Research (from IDENTITY.md)

- State every assumption before acting on it
- No generic advice — make it specific to Penny's stage, customer, and problem
- Evidence only in the `WHAT I KNOW` section of `IDENTITY_penny.md`
- Every interview finding tagged: INTERVIEW / OBSERVATION / DATA
- Do not revisit locked decisions unless founder says REOPEN #

---

*Penny — Internal Research Strategy Document · v1.0*
*Researcher role active. No findings in this document — strategy only.*

---

**LEARN:** Most early-stage founders do research in the wrong order — they interview before they listen, and they pitch before they ask. The right sequence is: (1) community listening to hear unprompted language, (2) interviews to understand the moment of pain, (3) WTP test to calibrate pricing. Skipping step 1 means your interview questions are shaped by your assumptions, not theirs.

**NEXT:** The single most leveraged first move is 3 hours of native Reddit browsing — r/freelance, r/webdev, r/graphic_design — searching "taxes" and "bookkeeping," sorted by Top, last 12 months. Record exact quotes and upvote counts. That observation session will tell you more about which segment to interview first than any framework.
