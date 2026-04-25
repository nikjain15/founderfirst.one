# CPA Data Model — v1 Schema

**Status:** Locked
**Last updated:** 2026-04-25
**Owners:** Nik (CEO)

This document is the canonical shape of `state.cpa`. The demo persists it in
`localStorage` under this key; production will persist server-side with the
same schema. Both the founder app and the CPA view read and write this shape.

---

## Design principles

1. **Single source of truth.** Founder and CPA surfaces both read and write
   `state.cpa` — no parallel copies.
2. **Per-client learning.** Rules learned for one client never cross to another.
3. **Immutable audit trail.** Transactions are never hard-deleted. Flags,
   annotations, and pending-adds are soft-lifecycle objects with status fields.
4. **Privacy on revocation.** CPA chat is deleted on revocation; action
   metadata (notes, flags, rules, pending-adds) is archived to the founder.
5. **Schema parity across demo and production.** Anything the demo invents in
   localStorage must match what a real backend would persist.

---

## Schema

```ts
state.cpa = {

  // ── CPA account ──────────────────────────────────────────────────────────
  // Present only if the current user is a CPA.
  account: {
    id:            string,       // uuid
    name:          string,
    email:         string,
    licenseNumber: string,
    licenseState:  string,       // e.g. "CA"
    verifiedAt:    number,       // timestamp
  } | null,

  // ── Invites ─────────────────────────────────────────────────────────────
  // Founder-side: outbound invites the founder has generated.
  // CPA-side:     inbound invite history the CPA has accepted or seen expire.
  invites: [
    {
      id:         string,
      token:      string,        // single-use, 32-char random
      clientId:   string,        // founder's account id
      cpaEmail:   string,
      cpaName:    string | null,
      createdAt:  number,
      expiresAt:  number,        // createdAt + 7 days
      consumedAt: number | null,
      status:     "pending" | "accepted" | "expired" | "revoked",
    }
  ],

  // ── Clients ─────────────────────────────────────────────────────────────
  // CPA-side only: map of clients this CPA has access to.
  clients: {
    [clientId]: {
      clientName:   string,
      // Matches ENTITY_TYPES enum in constants/variants.js exactly.
      // "llc" = undifferentiated (treated as SMLLC / Schedule C by default).
      // "llc-single" = confirmed single-member LLC → Schedule C.
      // "llc-multi"  = confirmed multi-member LLC → Form 1065 + K-1.
      entity: "sole-prop" | "s-corp" | "llc" | "llc-single" | "llc-multi" | "partnership",
      industry:     string,
      grantedAt:    number,
      yearGrants:   number[],    // years the CPA can view, e.g. [2025, 2026]

      // CPA-requested prior-year access, awaiting founder decision
      yearRequests: [
        {
          year:        number,
          requestedAt: number,
          note:        string,
          status:      "pending" | "approved" | "rejected",
        }
      ],

      // Per-client learning model
      learnedRules: [
        {
          id:           string,
          pattern:      string,  // case-insensitive glob: "*" matches any substring, "AWS*" matches prefix. e.g. "AWS*", "SQ *WHOLESALE*"
          fromCategory: string,
          toCategory:   string,
          suggestedBy:  "cpa" | "founder" | "penny",
          approvedBy:   "founder",
          approvedAt:   number,
          active:       boolean,
        }
      ],

      // Per-transaction CPA overlays
      flags: {
        [transactionId]: {
          reason:     "needs-receipt" | "reclassify" | "confirm-with-client",
          note:       string,
          flaggedBy:  string,    // cpaId
          flaggedAt:  number,
          resolvedAt: number | null,
        }
      },
      annotations: {
        [transactionId]: [
          {
            id:         string,
            text:       string,
            authorId:   string,
            authorRole: "cpa" | "founder",
            createdAt:  number,
          }
        ]
      },

      // CPA-added transactions awaiting founder acknowledgment
      pendingAdds: [
        {
          id:             string,
          date:           string,
          vendor:         string,
          amount:         number,
          category:       string,
          receiptUrl:     string | null,
          addedBy:        string, // cpaId
          addedAt:        number,
          acknowledgedAt: number | null,
          rejectedAt:     number | null,
          rejectionNote:  string | null,
        }
      ],

      // CPA-scoped chat. Deleted on revocation (not archived) per decision #6.
      chatHistory: [
        {
          id:        string,
          role:      "user" | "penny",
          content:   string,
          timestamp: number,
        }
      ],

      // Timestamp of the most recent write to this client's data (flags,
      // annotations, pendingAdds, approvals, learnedRules). Used by the
      // CPA dashboard to show "Last activity" on each client card.
      // Updated automatically by bumpLastActivity() in util/cpaState.js.
      lastActivityAt: number,

      // Computed, cached. Recomputed on any data write.
      taxReadiness: {
        score:           number, // 0–100
        uncategorized:   number, // count
        missingReceipts: number,
        flagged:         number,
        lastComputedAt:  number,
      },
    }
  },

  // ── Approvals lifecycle ─────────────────────────────────────────────────
  // Shared state — both founder and CPA apps read this.
  // Each approval eventually renders as a card in founder's Needs a look.
  approvals: {
    [approvalId]: {
      id:            string,
      type:          "reclassification"
                     | "year-access-request"
                     | "cpa-added-txn"
                     | "penny-question",
      clientId:      string,
      transactionId: string | null,
      suggestedBy:   string,      // cpaId or "penny"
      fromCategory:  string | null,
      toCategory:    string | null,
      candidates:    string[] | null,   // for penny-question: competing category options
      question:      string | null,     // for penny-question: the question Penny escalated
      note:          string,
      status:        "pending" | "approved" | "rejected",
      createdAt:     number,
      resolvedAt:    number | null,
      founderNote:   string | null,     // optional on reject
    }
  },

  // ── Archives ────────────────────────────────────────────────────────────
  // Founder-side. Populated on CPA access revocation.
  // chatHistory is intentionally NOT archived (see decision #6).
  archives: {
    [cpaId]: {
      cpaName:     string,
      revokedAt:   number,
      rules:       /* learnedRules[] */   any[],
      flags:       /* transactionFlags */ Record<string, any>,
      annotations: /* annotations */      Record<string, any[]>,
      pendingAdds: /* pendingAdds[] */    any[],
    }
  },
};
```

---

## ApprovalCard `card` object — shape per approval type

When an approval renders in the founder's Needs a look, the calling code
constructs a `card` object and passes it to `<ApprovalCard>`. The shape
below is the canonical contract — screens must not invent extra fields.

```ts
// All approval card objects share these base fields:
{
  variant:   string,       // from CARD_VARIANTS — e.g. "cpa-suggestion"
  approvalId: string,      // state.cpa.approvals[id].id — required for mutation dispatch
  vendor:    string,       // display name in the card header (e.g. "Adobe Creative Cloud")
  amount:    number | null,// transaction amount, null for year-access-request
  date:      string | null,// display date, null for non-transaction approvals
}

// RECLASSIFICATION / cpa-suggestion variant — extra fields:
{
  currentCategory:   string,  // the category before CPA's change
  suggestedCategory: string,  // what the CPA recommends
  cpaName:           string,  // CPA's display name (from state.cpa.clients[clientId].entity or account.name)
  cpaNote:           string,  // verbatim from approvals[id].note — rendered below Penny's copy
}

// YEAR_ACCESS_REQUEST variant — extra fields:
{
  yearRequested:  number,  // e.g. 2025
  cpaName:        string,
  cpaNote:        string,
}

// CPA_ADDED_TXN variant — extra fields:
{
  cpaName:   string,
  cpaNote:   string,
}

// PENNY_QUESTION variant — extra fields (CPA has already answered; founder approves the rule):
{
  question:     string,  // the question Penny escalated
  cpAnswer:     string,  // the CPA's chosen answer (from toCategory)
  cpaName:      string,
}
```

---

## Pattern derivation rule (learnedRules)

When `approveApproval` writes a `learnedRules[]` entry it must derive a
`pattern` that future transactions can match against. The rule is:

1. Take the first 1–3 words of `approvals[id].note` as the vendor prefix.
2. Append `*` — e.g. note begins `"Adobe Creative Cloud should sit in..."` → pattern `"Adobe Creative Cloud*"`.
3. Fallback: if the note is empty, use `fromCategory + "*"`.

This logic lives in `derivePattern()` in `util/cpaState.js`. The pattern
applies to future transactions for this client only (never cross-client).
Matching is prefix/substring at the vendor normalisation layer — the demo
uses `txn.vendor.startsWith(pattern.replace("*",""))`.

---

## Preferences extension

```ts
state.preferences = {
  ...existing,
  notifyCpaActivity: "real-time" | "daily-digest" | "off",
};
```

Default on first write: `"real-time"` if user previously selected real-time for
their general notifications, otherwise `"daily-digest"`.

---

## Mutation contracts

Named functions the UI calls. These are the only supported mutations — any
other write path is a bug.

| Function | Who calls it | What it does |
|---|---|---|
| `inviteUrl(token, baseUrl?)` | Founder app | Builds the shareable invite link: `<origin><baseUrl>cpa.html?token=<token>`. Uses `window.PENNY_CONFIG?.baseUrl` as default base. |
| `generateInvite(clientId, cpaEmail, cpaName?)` | Founder app | Pushes a new record to `invites[]` with `status: "pending"`. Returns `{ token, expiresAt }`. Call `inviteUrl(token)` for the shareable URL. |
| `revokeInvite(inviteId)` | Founder app | Sets status to `"revoked"`. Invite link stops working. |
| `acceptInvite(token, cpaAccountFields)` | CPA app (signup) | Validates token + license fields. Creates `account`. Promotes the matching invite to `"accepted"`. Creates `clients[clientId]` with current-year grant. |
| `requestPriorYearAccess(clientId, year, note)` | CPA app | Appends to `clients[clientId].yearRequests[]`. Creates an `approvals[]` record of type `year-access-request`. |
| `grantYearAccess(clientId, year)` | Founder app | Approves the matching year-access-request. Appends year to `yearGrants[]`. Resolves the approval. |
| `flagTransaction(clientId, txnId, reason, note)` | CPA app | Writes `clients[clientId].flags[txnId]`. Bumps `taxReadiness` recompute. |
| `annotateTransaction(clientId, txnId, text)` | CPA or founder | Appends to `clients[clientId].annotations[txnId]`. |
| `suggestReclassification(clientId, txnId, fromCategory, toCategory, note)` | CPA app | Creates `approvals[id]` of type `reclassification`. Renders as a `cpa-suggestion` card in founder's Needs a look. |
| `addTransactionAsCpa(clientId, txnFields, receipt?)` | CPA app | Appends to `clients[clientId].pendingAdds[]`. Creates `approvals[id]` of type `cpa-added-txn`. Founder notified per `notifyCpaActivity`. |
| `approveApproval(id)` | Founder app | Resolves approval as `"approved"`. If reclassification: applies the category change AND writes a new `learnedRules[]` entry. If year-access-request: grants the year. If cpa-added-txn: moves the txn into the official ledger. If penny-question: writes the CPA's answer as a learned rule. |
| `rejectApproval(id, founderNote?)` | Founder app | Resolves approval as `"rejected"`. Original state preserved. CPA's Resolved queue shows the note. |
| `deleteLearnedRule(clientId, ruleId)` | CPA app | Sets `active: false` on the rule. Rule stays in the array for audit but stops applying. Penny does not moralize — rule-deletion is metadata, not a ledger edit. |
| `revokeCpaAccess(cpaId)` | Founder app | Moves `clients[clientId]` entries into `archives[cpaId]`, **deletes** `chatHistory`, sets all outstanding `approvals` for this CPA to rejected-by-revocation, CPA loses access immediately on next request. |
| `recomputeTaxReadiness(clientId)` | Any mutation that writes `flags`, `pendingAdds`, or category assignments | Pure helper — reads `clients[clientId]` and returns an updated `taxReadiness` object. Called automatically inside `flagTransaction`, `addTransactionAsCpa`, and `approveApproval`. UI never calls this directly. |
| `bumpLastActivity(cpa, clientId)` | Every mutation that modifies a client's data | Sets `clients[clientId].lastActivityAt = Date.now()`. Called internally at the end of every mutation that touches a client. UI never calls this directly. |
| `inviteUrl(token, baseUrl?)` | Founder app UI | Builds the shareable invite link string. Pure function, no state change. |

---

## Fixture synthesis rules

`public/config/cpa-fixture.json` is the canonical pre-built fixture — it
contains fully hydrated `flags`, `annotations`, `pendingAdds`, `approvals`,
and `learnedRules` for each client. Builders should use this fixture as-is
and not attempt to synthesize records from scenario data at runtime.

If adding a new client to the fixture, follow these rules:

1. **Transaction IDs** — use the format `txn-s{N}-{M}` where N is the
   client ordinal (01, 02, …) and M is the transaction index. These IDs
   are fictional for the demo but must be stable across refreshes.
2. **Flags** — pick 2–4 transactions. Mix `needs-receipt`, `reclassify`,
   `confirm-with-client` evenly. Notes must be substantive CPA-quality
   text referencing specific IRS publications, thresholds, or form lines.
3. **Learned rules** — 2 rules minimum. Patterns use the format
   `"VendorPrefix*"`. Categories must be from `categories.v1.json`.
4. **Pending adds** — 0–2 per client. `IRS EFTPS` estimated tax payments
   are the canonical example; use realistic amounts for the entity type.
5. **Approvals** — at least one `reclassification` + one `cpa-added-txn`
   per client. A `year-access-request` for S-Corp clients. A
   `penny-question` to demonstrate the escalation path.
6. **Tax readiness** — compute manually from the formula above; do not
   guess. Weights: uncategorized × 3, missingReceipts × 2, flagged × 4.
7. **`lastActivityAt`** — set to the most recent `createdAt` /
   `flaggedAt` / `addedAt` across that client's records.

## Seed file

`public/config/cpa-fixture.json` assembles 3–5 clients from existing scenario
keys so the CPA dashboard has something meaningful on first load.

The fixture is an **object map** (not an array) matching the runtime schema
exactly — `clients` is keyed by `clientId`, and every client object carries
full inline data (`learnedRules`, `flags`, `pendingAdds`, `chatHistory`,
`taxReadiness`). There is no `seeded` count-summary field; the fixture IS the
seed. See `public/config/cpa-fixture.json` for the canonical example.

```json
{
  "account": { "id": "cpa-priya-demo", "name": "Priya Sharma", "..." },
  "clients": {
    "client-001": {
      "clientName":   "Sarah Chen — Studio Nine Consulting",
      "scenarioKey":  "sole-prop.consulting",
      "entity":       "sole-prop",
      "industry":     "consulting",
      "grantedAt":    1745500000000,
      "yearGrants":   [2026],
      "yearRequests": [],
      "learnedRules": [ ... ],
      "flags":        { "txn-id": { ... } },
      "annotations":  { "txn-id": [ ... ] },
      "pendingAdds":  [ ... ],
      "chatHistory":  [],
      "taxReadiness": { "score": 83, "..." }
    }
  },
  "approvals": { "appr-001": { ... } },
  "archives":  {},
  "invites":   []
}
```

On boot the CPA app reads this fixture and hydrates `state.cpa` directly.

---

## Dashboard computed values

### Open-items count (per client card on the CPA dashboard)

```
openItemsCount = unresolved flags count
               + uncategorized pendingAdds count   (pendingAdds where category === "")
               + pending penny-questions count      (approvals[].type === "penny-question" && status === "pending")
```

Used for the amber badge on client cards. Shows 0 with no badge when all clear.

### Pending approvals count (per client card on the CPA dashboard)

```
pendingApprovalsCount = count of approvals[].status === "pending"
                        where approvals[].clientId === this clientId
                        AND   approvals[].type !== "penny-question"
```

Penny-questions are excluded because they appear in the work queue under
priority-4, not the same "pending CPA suggestion" bucket.

---

## Computed values

### Tax readiness score

```
score = 100
      − (uncategorizedWeight   × uncategorizedCount)
      − (missingReceiptWeight  × missingReceiptCount)
      − (flaggedWeight         × flaggedCount)
clamped to [0, 100].
```

Weights are tunable during build; start with:
- `uncategorizedWeight = 3`
- `missingReceiptWeight = 2`
- `flaggedWeight = 4`

Bands for visual treatment:
- 90–100: clean (monochrome ink, no accent)
- 70–89: amber
- 0–69: error (red border on the client card)

Recompute on every write to `flags`, `pendingAdds`, or category assignments.

---

## What this schema does NOT support in v1

These are deliberate omissions. Design must not block them but the demo does
not implement them:

- Multiple CPAs per client (sub-users within a CPA firm).
- Transaction-level comment threads (annotations are flat notes, not threaded).
- Multi-year side-by-side comparison (2024 vs 2025 P&L in a single view).
- CPA billing to clients.
- Direct IRS form pre-fill export (e.g., auto-populated Schedule C PDF).
- Full audit trail of every CPA action on a client account.

---

*Source decisions: `cpa-view-spec.md` v1.1 · CLAUDE.md §CPA View.*
