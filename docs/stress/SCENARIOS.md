# SCENARIOS — regression index (finding → scenario file → status)

> Status: **active** · 2 Jul 2026 · Owner: REG-1 (regression-engineer role)

This is the map from a confirmed finding / feature acceptance to the automated
scenario that guards it and its current status. REG-1 owns and back-fills this
index across all stress features; feature cards append their own rows as they land
so the product can never silently re-break.

Status legend: ✅ passing · ⬜ untested · 🟥 failing.

## W1.4 — CPA Practice home (cross-client work queue)

| id | scenario file | status |
| --- | --- | --- |
| W1.4-QUEUE | supabase/tests/w1_4_cpa_practice_queue_test.sql | ✅ |

## W1.5 — CPA collaboration primitives (flag · note · add-txn · reclass)

All land in `supabase/tests/w1_5_cpa_collaboration_test.sql` (pgTAP round-trip +
guardrails). Each id maps to a labelled assertion in that file.

| id | what it proves | status |
| --- | --- | --- |
| W1.5-FLAG | full CPA flags an entry → open flag; idempotent; surfaces in the W1.4 queue `flagged` column (rank 4, journal surface) + client-counts badge | ✅ |
| W1.5-NOTE | full CPA annotates an entry; an empty note is refused | ✅ |
| W1.5-RECLASS | CPA suggests reclass (medium tier, pending_review) → nothing moves → CPA cannot self-approve → owner approves → entry recategorized AND a rule is learned | ✅ |
| W1.5-ADDTXN | CPA proposes a missing txn (unbalanced refused) → nothing posts until owner acknowledges → on approve exactly one entry posts | ✅ |
| W1.5-ISO | an outsider with no engagement cannot flag another org's entry (forged-actor class) | ✅ |
| W1.5-PERIODLOCK | approving an add-txn dated into a CLOSED period is refused (nothing posts into a closed period) | ✅ |
| W1.5-READONLY | a read_only CPA cannot flag or suggest (server-side gate, not just UI) | ✅ |
| W1.5-AUDIT | flag and approval each write a ledger_audit row | ✅ |
