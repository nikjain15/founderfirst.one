# Partner Applications — Start These Now

*Owner: Nik. Start all applications as early as possible — several have multi-week review times.*
*Last updated: 2026-04-23*

---

## Why this exists

You cannot use these APIs in production without approval. Some take days, some take weeks. A late application will block a finished Track from shipping. Apply before you write integration code.

**Requirement for all:** you need an incorporated entity (Delaware C-Corp) and a live website or app description. Do Step 1 of `legal-checklist.md` first.

---

## Applications

### Plaid — Bank feeds
- **What it unlocks:** Track D (bank ingestion)
- **Apply at:** https://plaid.com/docs/account/activity/#production-access
- **What they need:** company info, use case description, estimated transaction volume, privacy policy URL
- **Review time:** 1–2 weeks
- **Notes:** Apply for Production access (SMB tier). Development access is instant and works for building.
- **Status:** ☐ Not started

---

### Intuit Developer — QBO Export + QBO Payroll
- **What it unlocks:** Track D (QBO Payroll ingestion), Track G (QBO export format), Track H (TurboTax interchange path)
- **Apply at:** https://developer.intuit.com → create an app → request production keys
- **What they need:** app description, OAuth redirect URIs, scopes requested, privacy policy, terms of service
- **Review time:** 1–3 weeks
- **Notes:** You need two separate scopes: `com.intuit.quickbooks.accounting` for QBO export and `com.intuit.quickbooks.payment` for payroll. Apply for both at once.
- **Status:** ☐ Not started

---

### PayPal Partner API — Venmo
- **What it unlocks:** Track D (Venmo/PayPal payment ingestion)
- **Apply at:** https://developer.paypal.com/home → contact partner team
- **What they need:** company info, integration description, data usage policy
- **Review time:** 2–4 weeks (Venmo access specifically is gated — flag this in the application)
- **Notes:** Venmo runs on PayPal infrastructure. The partner API application covers both.
- **Status:** ☐ Not started

---

### Track1099 — 1099-NEC e-filing
- **What it unlocks:** Track G (1099-NEC filing via IRS)
- **Apply at:** https://www.track1099.com/api
- **What they need:** API key request, company details, estimated filing volume
- **Review time:** A few days — simpler than the above
- **Notes:** Alternatively evaluate Tax1099 (https://www.tax1099.com) as a backup. Get both quotes.
- **Status:** ☐ Not started

---

### Discord — Bot app for per-user support channels
- **What it unlocks:** Track J (support surface — per-user private channels + Claude bot)
- **Apply at:** https://discord.com/developers/applications → create bot application
- **What they need:** bot description, permissions requested, server details
- **Review time:** Usually fast (days), but verified bot status for large servers takes longer — not needed at beta scale
- **Notes:** You'll create a Penny-operated Discord server. On user signup, the bot auto-creates a private channel (`#support-[username]`) visible only to that user + you + the bot.
- **Status:** ☐ Not started

---

### Apple Developer Program — iOS + APNs + App Store
- **What it unlocks:** Track I (iOS app via TestFlight + App Store), push notifications via APNs
- **Apply at:** https://developer.apple.com/programs/enroll/
- **What they need:** Apple ID, entity info, $99/year fee
- **Review time:** Usually 24–48 hours; occasionally longer for new orgs
- **Notes:** Enroll under the **organization** account (not personal) so the corp owns the app, not you individually.
- **Status:** ☐ Not started

---

### OpenExchangeRates — FX rates
- **What it unlocks:** Track C (multi-currency FX rate feed)
- **Apply at:** https://openexchangerates.org/signup
- **What they need:** just sign up — paid plan selection
- **Review time:** Instant
- **Notes:** Get the **Startup** or **Developer** plan. Rates cached daily in `fx_rates` table — no real-time plan needed.
- **Status:** ☐ Not started

---

### Veryfi — Receipt OCR
- **What it unlocks:** Track F (OCR ingestion)
- **Apply at:** https://www.veryfi.com/api/
- **What they need:** API key signup, company details
- **Review time:** A few days
- **Notes:** Start on the free tier to validate accuracy against your receipt corpus. Upgrade before beta.
- **Status:** ☐ Not started

---

### SOC 2 Automation Tool — Vanta or Drata
- **What it unlocks:** Track K (SOC 2 Type I before public beta)
- **Vanta:** https://www.vanta.com — get a quote
- **Drata:** https://drata.com — get a quote
- **Review time:** Onboarding takes ~1–2 weeks; the actual audit readiness is 90+ days of controls running
- **Notes:** Engage **90 days before you want the audit done**. Both connect to AWS, GitHub, Supabase, etc. and track controls automatically. Budget ~$10–15k/year at early stage.
- **Status:** ☐ Not started

---

## Sequencing

1. **Incorporate first** (blocks all of the above)
2. **Apple + Plaid + Intuit** — longest review times; apply within week 1 of incorporation
3. **PayPal/Venmo** — apply week 1; expect the slowest response
4. **Track1099 + Veryfi + OpenExchangeRates** — apply any time; faster turnaround
5. **Discord** — apply when Track J is in the build queue
6. **Vanta/Drata** — engage 90 days before public beta target date

---

*Reference: `BookKeeping/demo/IMPLEMENTATION-STRATEGY.md` §6 (Integration catalog) for full vendor list.*
