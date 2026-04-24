# 12 — Platform
*Device strategy, mobile landing surface, offline capture, device security, multi-currency, accounting basis.*

Decisions covered: D57, D73, D81, D82. Engineering: E25 (multi-currency), E26 (accounting basis), E36 (Face ID).

---

## Web vs. mobile (D57)

**Mobile is primary. Web is the full-screen experience. Both surfaces support the full experience.**

### Mobile — daily use

- Daily capture
- Approvals
- Conversation with Penny
- iOS first (Face ID, D82), Android after

### Web — sitting-down review

- Trends across multiple periods
- Bulk editing
- Detailed reports
- Exports
- Advanced filters

---

## Mobile landing surface (D73, 🧪 hypothesis)

**Current hypothesis:** Penny's default mobile landing is a **quiet status view**:

> *"3 things need you. 1 important: $1,800 charge I haven't seen. Everything else is fine."*

The conversation thread is a **peer surface**, accessible with one tap, not the landing.

Conversational tone remains everywhere in the product.

### Rationale

Users glance at money apps 10–30× per week; they don't want to scroll a conversation to find status. AI makes chat a great **depth** surface; it doesn't make chat the right high-frequency **glance** surface. Letting the user pick the depth is more AI-native than forcing every interaction through a conversational bottleneck.

### Validation required

2-week diary study with 8–10 solo freelancers before locking (Deliverable Q-N1, Head of Research).

---

## App structure — four persistent tabs

| Tab | Label | Purpose |
|---|---|---|
| 1 | Penny | Home — active conversation thread. Default landing if D73 reverts. |
| 2 | Add | Opens capture bottom sheet (receipt photo, quick note, voice). One tap from anywhere. |
| 3 | My Books | Financial review — P&L, invoices, expenses, CPA export. |
| 4 | Connect | Integrations and preferences. |

**Add is a native tab with a label — NOT a floating action button.**

---

## Design rules

- Every screen must work at **375px wide** (minimum phone width). No exceptions.
- **Production-grade iOS quality**, not wireframe quality.
- Penny avatar: dashed lo-fi style (`#BDBDBD` dashed border, `#E0E0E0` fill). Never solid / filled / dark.
- Max **3 items visible at once** on the Penny conversation screen.
- **16px minimum spacing** between content groups.
- Full-width CTAs, aligned to content margin.
- Voice input button: 36×36px, mic icon, Deep Ocean light background idle / Ocean fill recording.

Full design system: `../../design/design-system.md`.

---

## Offline capture (D81)

Receipt photos, voice notes, and manual entries capture offline and queue locally, syncing on reconnect.

- Penny's UI shows a quiet **"offline — will sync"** banner — **not an alarm**
- Offline categorisation and offline P&L are **not supported** — those require server-side data
- The capture moment is **never blocked by connectivity**
- Conflict resolution on reconnect follows D10 and D12 (see [04-data-input.md](04-data-input.md)): flag potential duplicates / matches, never silently merge
- Offline-queued entries flow through the same approval-card surface as live entries on sync

Engineering: WatermelonDB on SQLite (implementation-strategy v2, E3).

---

## Device security — enterprise-grade from day one (D82)

Security model designed for future enterprise review, **not retrofitted**. Rework on security is expensive and trust-damaging; Penny builds for the highest bar from the start.

### Required at launch

- **Face ID / passcode required** on every app open — default 5-minute timeout, **user-configurable in Preferences** (E36)
- **Session token expiry** with silent refresh
- **"Sign out all devices"** control in Connect → Preferences
- **Remote wipe** via Connect → Preferences — wipes Penny's local data on a lost device the next time it reconnects
- **Device trust:** a new device requires email confirmation + Face ID before first use
- **Full audit log** of sensitive actions (export, cancel, share link, CPA access) — visible to Alex, exportable, **7-year retention**
- **Field-level encryption** on sensitive fields (bank account numbers, SSN if collected)
- **MDM-compatible deployment path** (even if not marketed to enterprise at launch)

### Re-auth actions (E23)

All four selected: silent retry first; Penny-authored notice only after threshold; batched re-auth prompts in the morning; explicit re-auth when a specific action (export, transfer) requires fresh auth.

### Architectural principle

Security retrofit costs **5–10×** what building it right costs now. Build for the highest bar Alex might one day need.

---

## Multi-currency (E25)

**Full multi-currency from day one.** US launch geography stands (US-only).

### Schema fields

- `original_currency`
- `original_amount_cents`
- `usd_amount_cents`
- `fx_rate`
- `fx_rate_source`
- `fx_rate_timestamp`

### Behaviour

- USD is reporting currency (IRS requirement)
- Original currency and rate preserved
- FX gain/loss tracked for accrual basis
- Rate provider: **OpenExchangeRates**

### Display (D17)

Penny always shows USD prominently, original currency as supporting context:

> `+$3,680 USD · 5,000 CAD @ 0.736`

---

## Accounting basis — cash + accrual toggle (E26)

Both bases supported from launch.

- **Cash basis default** for new users
- **Accrual basis** available via toggle
- **Entity-type aware** — S-Corp defaults may differ from sole prop
- **Both bases maintained in the ledger projection** so Alex can switch at tax time without re-booking history

Architecture extension required for accrual projection — `../../architecture/system-architecture.md` v4.1 (pending).

---

## Encryption

**Per-user KMS envelope encryption** for all financial data (E33).

- Per-user data encryption keys (DEKs)
- DEKs wrapped by per-user KMS keys (KEKs)
- Key rotation supported at the KEK level without re-encrypting data
- Field-level encryption for sensitive fields per D82

Engineering detail: `../../engineering/implementation-strategy.md` v2, E33, §5.

---

## Cost guardrails

**Per-user daily spend cap + global circuit breaker** (E34).

- Per-user AI spend cap — protects against runaway usage on a single account
- Global circuit breaker — protects against a model-cost spike affecting all users
- Thresholds not yet finalised — see BUILD-TRACKER.md

---

## OTA updates

Expo EAS Update with **10% staged rollout + auto-rollback** on error-rate spike (E31).

---

*Next: [13-hard-rules.md](13-hard-rules.md)*
