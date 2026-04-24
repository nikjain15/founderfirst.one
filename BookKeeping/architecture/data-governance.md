# Penny — Data Governance & Privacy Framework
**Version 0 · April 2026 — PLACEHOLDER**

> This document defines the full data governance, privacy, and compliance framework for Penny. The architectural principles are in `penny-architecture.md`. This document expands those principles into detailed policies, schedules, and open questions that must be resolved before launch.

---

## Core Principles (from Architecture)

- Data retention follows regulation first, user preference second
- Data minimisation is an engineering discipline — collect only what's needed
- Data residency is the United States — user financial data does not leave the country
- Privacy is the default — no data sharing without explicit, revocable opt-in

---

## Open Questions — Must Resolve Before Launch

### 1. CCPA vs. IRS Retention Conflict
California Consumer Privacy Act gives users the right to request deletion of personal data. IRS regulations require financial records to be retained for 3–7 years. These directly conflict when a California-based user requests account deletion mid-retention period.

**Questions to resolve:**
- Which fields can be anonymized (PII stripped) while preserving the financial record for IRS compliance?
- What is the timeline for honoring a deletion request — immediate anonymization with retained financial data, or a queued process?
- Do we need separate data handling for California users, or do we apply the most restrictive standard (CCPA) to all US users?
- What does the user see when they request deletion? What does Penny say?
- How is this documented in the audit trail?

---

### 2. Data Retention Schedule
The architecture states the IRS minimums (3 years general, 7 years for assets). The detailed schedule needs to define:

**Questions to resolve:**
- What is the retention period for each data type? (Transaction records, receipt images, AI enrichment data, vendor memory, audit log entries, conversation history, notification history)
- Are receipt images retained for the same period as the transaction they support, or shorter?
- What happens to vendor memory when an account is closed — is it retained, anonymized, or deleted?
- What is the schedule for automated data cleanup after the retention period expires?
- Is there a "retain everything forever" option for users who want it?

---

### 3. Account Closure & Data Export
When Alex closes her account, the architecture promises a full data export and a retention preference choice. The details need to be defined:

**Questions to resolve:**
- What format is the full data export? (PDF reports + CSV transaction data + receipt images as a zip? Machine-readable JSON?)
- How long does the export remain available after account closure?
- What does the retention preference UI look like — what options does Alex have?
- After the retention period ends, is the data truly deleted or merely anonymized?
- What confirmation does Alex receive that her data has been handled according to her preference?

---

### 4. AI Training Data Governance
The architecture defines shared model training as explicit opt-in only. The governance framework needs to define:

**Questions to resolve:**
- What exactly is "anonymized correction data"? Which fields are included, which are stripped?
- How is anonymization verified — is there a risk of re-identification from transaction patterns?
- When a user revokes opt-in, what happens to their data that has already been used in training? (Can it be removed from a trained model? In practice, no — this needs to be disclosed honestly to the user.)
- Where is the opt-in preference stored and how is it surfaced? (Architecture says the Connect tab.)
- Is there a separate consent for different types of data use (improving categorization vs. improving Penny's conversational responses)?

---

### 5. Third-Party Data Sharing
Penny connects to Plaid, Stripe, and other providers. Data flows both ways.

**Questions to resolve:**
- What data does each third-party provider receive from us, if any? (Plaid receives account credentials — but we don't store those. Do we send anything back?)
- Do any providers have data sharing terms that conflict with our privacy principles?
- How do we handle a third-party data breach that affects our users' data held by that provider?
- Are there third-party sub-processors (cloud provider, AI model provider) that need to be disclosed to the user?

---

### 6. CPA / Accountant Access
The accountant needs access to Alex's books for tax filing. The architecture mentions CPA export but doesn't define the access model.

**Questions to resolve:**
- Is the accountant's access export-only (Alex sends them a file), or does the accountant get a login to view the books directly?
- If there's a direct access model, what is the trust boundary? Can the accountant edit? Can they only view? Can they make adjusting journal entries?
- Does Alex explicitly grant and revoke accountant access? How?
- What audit trail is maintained for accountant actions?
- Is accountant access in scope for v1, or is export-only sufficient?

---

### 7. Data Breach Response
If Penny experiences a data breach, users must be notified.

**Questions to resolve:**
- What is the notification timeline? (CCPA requires notification. Most best practices suggest 72 hours.)
- What is the notification mechanism — email, in-app, both?
- What information is disclosed to affected users?
- What remediation is offered?
- Is there a pre-written breach notification template?
- Who makes the call on breach severity and notification scope? (Founder, for now.)

---

### 8. State-Level Privacy Laws
Beyond CCPA, other US states have enacted or are enacting privacy laws (Virginia CDPA, Colorado CPA, Connecticut, Utah, etc.).

**Questions to resolve:**
- Do we apply the most restrictive state standard universally, or handle state-by-state?
- Are we tracking which states our users are in?
- How do we stay current with evolving state-level requirements?

---

## Policies to Define (After Open Questions Are Resolved)

- [ ] Full data retention schedule by data type
- [ ] Data deletion / anonymization procedure
- [ ] Account closure procedure and timeline
- [ ] Privacy policy (user-facing, plain English)
- [ ] Terms of service (user-facing)
- [ ] AI training data consent language
- [ ] Third-party sub-processor list
- [ ] Data breach response plan
- [ ] Accountant access policy
- [ ] Annual privacy review process

---

*Penny · Data Governance & Privacy Framework · Placeholder · April 2026*
*No policy should be finalized until the corresponding open questions are resolved.*
