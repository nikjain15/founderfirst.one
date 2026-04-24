# CPA Data Model — v1 Schema

**Status:** Locked
**Last updated:** 2026-04-24
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
      entity:       "sole-prop" | "llc" | "s-corp" | "partnership",
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
          pattern:      string,  // vendor or description pattern, e.g. "AWS*"
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
      candidates:    string[] | null,   // for penny-question type
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
| `generateInvite(clientId, cpaEmail, cpaName?)` | Founder app | Pushes a new record to `invites[]` with `status: "pending"`. Returns `{ token, expiresAt }`. |
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

---

## Seed file

`public/config/cpa-fixture.json` assembles 3–5 clients from existing scenario
keys so the CPA dashboard has something meaningful on first load. Required
shape:

```json
{
  "account": {
    "id": "cpa-demo",
    "name": "Priya Sharma",
    "email": "priya@sharmacpa.com",
    "licenseNumber": "CA-112233",
    "licenseState": "CA",
    "verifiedAt": 1745500000000
  },
  "clients": [
    {
      "clientId": "client-001",
      "scenarioKey": "sole-prop.consulting",
      "clientName": "Sarah Lin — Studio Nine",
      "entity": "sole-prop",
      "industry": "consulting",
      "yearGrants": [2026],
      "seeded": {
        "learnedRules": 2,
        "flags":        3,
        "pendingAdds":  1,
        "approvalsPending": 2
      }
    }
    // 2–4 more ...
  ]
}
```

On boot the CPA app reads this fixture, hydrates `state.cpa.clients`, and
synthesizes realistic `flags`, `pendingAdds`, and `approvals` from the
referenced scenario's ledger.

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
