# Admin design principles

How we keep `/admin` clean as features accrete. The admin gets overloaded not
from the *number* of features but from having **no rule for where a new one
goes** — so each grabs a tab or a Settings row. These principles make placement
a decision, not a default. Read this before adding any admin surface.

## The seven

### 1. Organize around jobs, not data sources or tools
A tab answers *"what am I trying to do,"* never *"which tool/table is this
from."* GA4 and PostHog are one **Product** tab because the job ("understand
usage") is one job regardless of vendor.
**Test:** if two tabs serve the same question, they're one tab with two sections.

### 2. Primary nav is fixed at 4–5. Adding a tab requires removing one.
The top-level nav is a **hard budget**, not a growing list — that's what makes
it memorable. Today: Support · Audience · Analytics · Penny. A new feature
slots *into* one of these; it almost never earns a new tab.

### 3. Max three levels of depth: Tab → Sub-tab → Detail.
No tabs-inside-tabs-inside-tabs. A 4th level means the thing is misfiled or
overbuilt. Keep the hierarchy shallow so muscle memory works.

### 4. One concept, one home — everything else links to it.
(Mirrors LEARNINGS rule #6.) Each concept has exactly one canonical place;
other surfaces *link* to it, never re-render it. Example: the **Signals
pipeline ops** live in Audience; the **Signals numbers** live in Analytics;
each cross-links the other. Two homes for one thing → drift + double maintenance.

### 5. Split by cadence: daily work in nav, set-and-forget in Settings.
The line between a primary tab and a Settings item is **how often you touch it.**
Support / Audience / Analytics / Penny = daily. Emails, Quality, Admins, Audit
log, How-it-works = configure rarely → Settings. Opening a Settings item daily
means it's misfiled.

### 6. Every data screen leads with "so what / now what."
A wall of charts makes the human do the synthesis. Each data screen opens with a
`<Takeaway>` ([src/lib/Takeaway.tsx](src/lib/Takeaway.tsx)) — a computed headline
plus, where there's an obvious next step, an action link. Bias toward a
recommended action over raw numbers.

### 7. Inherit the pattern — new features look like old features.
Same tab component, same hash-deep-linking, same KPI-strip → Takeaway → chart →
breakdown rhythm, same version-history + set-live flow for anything editable.
A new feature should be learnable for free because it behaves like everything
else. Consistency is what lets us add features without adding cognitive load.

## Penny is a teammate, not a config object
Penny's *configuration* (prompt + voice) lives in the **Penny** tab (with the site copy + blog), versioned and
set-live. Penny's *work* belongs **inside each job**: drafts the reply in
Support, the read + recommended action in Analytics, outreach + copy in
Audience / Emails. Exposing only the config half is what leaves Penny
under-leveraged. Surface the work where the work happens.

## The litmus test for any new feature
> Which existing job does this serve? → it goes there as a section / sub-tab.
> Serves no existing job? → it's either config (Settings), or a genuinely new
> job worth a tab (**and you remove one**), or you don't build it yet.

A new top-level tab should feel almost illegal.
