# Legal Checklist — Pre-First-User

*Owner: Nik. Must be complete before any real user touches the product.*
*Last updated: 2026-04-23*

---

## Step 1 — Incorporate

- [ ] Form a **Delaware C-Corp** (use Stripe Atlas or Clerky, ~1 week turnaround)
- [ ] Obtain **EIN** from IRS (free, same day via IRS.gov)
- [ ] Open a **business bank account** (Mercury or Brex recommended for startups)
- [ ] Get a **business credit card** for all vendor spend

> Plaid, Stripe, and Intuit all require an incorporated entity before they approve a production application. Do this first.

---

## Step 2 — Engage General Counsel

Recommended firms (startup-friendly):
- **Cooley** or **Gunderson** — full startup package, well-known to VCs
- **Lextech** or **Atrium** — leaner, lower cost for pre-seed

Scope for GC engagement:
- [ ] **Terms of Service** — what users agree to when they use Penny
- [ ] **Privacy Policy** — what data Penny collects, how it's used, how it's deleted
- [ ] **DPA template** (Data Processing Addendum) — sign this with every vendor (Supabase, AWS, Anthropic, Veryfi, Plaid, etc.)
- [ ] **CCPA compliance** — California Consumer Privacy Act requirements
- [ ] **Financial-services disclaimers** — Penny is not a licensed financial advisor; copy must reflect this
- [ ] **Email ingestion legal review** — D74 (Gmail/Outlook OAuth flow) must be reviewed before any code ships
- [ ] **Federated learning privacy review** — E10 architecture doc must be reviewed before training infra accepts any opted-in data
- [ ] **Data deletion certificate wording** — E39 (the cert email sent at T+30 hard delete)
- [ ] **Support-access grant copy** — E40 (the UI copy when Alex grants support access)

---

## Step 3 — IP Assignment

- [ ] All code written before incorporation must be formally **assigned to the corporation**
- [ ] Standard IP assignment agreement — your GC provides the template

---

## Step 4 — Trademark

- [ ] "Penny" is a common word — ask GC to check USPTO availability for **"Penny Books"** or a similar variant
- [ ] File trademark application once a defendable name is confirmed
- [ ] Do not print, advertise, or register domains under a name until counsel clears it

---

## Step 5 — Cyber Insurance

- [ ] Get a quote from **Coalition** or **At-Bay** (both startup-friendly, ~$2–5k/year at early stage)
- [ ] Policy must be **bound before the first real user** — not after
- [ ] Coverage should include: data breach, cyber liability, business interruption

---

## Step 6 — Data Processing Addendums

Sign a DPA with every vendor before that vendor touches user data:

| Vendor | DPA needed |
|---|---|
| Supabase | Yes |
| AWS | Yes |
| Anthropic | Yes |
| Veryfi | Yes |
| Plaid | Yes |
| Stripe | Yes |
| Gusto / OnPay / QBO Payroll | Yes |
| Google (Document AI + Gmail OAuth) | Yes |
| Microsoft (Outlook OAuth) | Yes |
| PostHog | Yes |
| Sentry | Yes |
| Cloudflare | Yes |
| Track1099 | Yes |
| Discord | Yes |

---

## Gate

**Nothing ships to a real user until Steps 1–6 are complete.**

---

*Reference: `BookKeeping/engineering/implementation-strategy.md` §12 for legal setup context.*
