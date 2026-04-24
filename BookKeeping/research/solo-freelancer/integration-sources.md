# Penny — Integration Sources by Core Activity
**Role: Researcher · Standard: Evidence-only**
*Verified against official developer documentation and public sources, April 2026*
*Purpose: catalogue every known data source for each core activity — what it offers, how it's accessed, what it costs, what it doesn't cover*

---

> **Access model key:**
> 🟢 OPEN — self-serve developer account, no approval required
> 🟡 PARTNER — requires application or agreement before access
> 🔴 ENTERPRISE — B2B contract only; not available to individual developers
> ❌ CLOSED — no programmatic access available

> **Confidence key:**
> ✅ PRIMARY — read directly from source · 🔵 SECONDARY — cited by credible outlet · ⚠️ PARTIAL — available but restricted or limited

---

## The Four Core Activities

| # | Activity | What it covers |
|---|---|---|
| 1 | **Payment Received** | When money came in, from whom, on which platform, how much net of fees |
| 2 | **Expense Logging** | What was spent, on what, with what documentation |
| 3 | **Reconciliation** | Matching platform-reported income against bank-received income against IRS-reported figures |
| 4 | **Invoice Creation / Follow-up** | Creating, sending, and chasing professional invoices |

---

## ACTIVITY 1: PAYMENT RECEIVED

*What data sources know about money a freelancer received.*

---

### Stripe

| Attribute | Detail |
|---|---|
| **Data available** | All charges processed through Stripe: gross amount per transaction, platform fees, net payout, refunds, customer name/email, date, payment method type |
| **Historical depth** | Full account history (no published limit) |
| **Real-time availability** | Yes — events fire immediately on payment completion |
| **Access model** | 🟢 OPEN — standard developer account; user authorises via OAuth |
| **Geographic scope** | US ✅ |
| **Cost to access data** | Free — no charge for reading transaction data |
| **Mobile app** | Stripe has iOS and Android apps; user can view their own transaction history |
| **Known constraints** | Only covers payments processed through Stripe; cannot read PayPal or Square transactions |

Source: [Stripe Balance Transactions API](https://docs.stripe.com/api/balance_transactions/list) ✅ PRIMARY

---

### PayPal

| Attribute | Detail |
|---|---|
| **Data available** | Full transaction history: gross amount, fees charged, net amount, counterparty name/email, date, transaction type (sale / refund / transfer) |
| **Historical depth** | Up to 3 years |
| **Real-time availability** | Yes — event notifications available; 3-hour lag before transactions appear in history API |
| **Access model** | 🟡 PARTNER — reading transactions on behalf of a third-party user requires PayPal Partner status; not self-serve; application required |
| **Geographic scope** | US ✅ |
| **Cost to access data** | Free once partner status is granted |
| **Mobile app** | PayPal has iOS and Android apps; users can view their own transaction history |
| **Known constraints** | Partner approval is not instant and is not guaranteed; adds lead time before integration can be built and shipped |

Source: [PayPal Transaction Search API](https://developer.paypal.com/docs/transaction-search/) ✅ PRIMARY

---

### Square

| Attribute | Detail |
|---|---|
| **Data available** | All payments processed through Square: gross amount, fees, net, card brand, location, date, refunds, customer information if captured |
| **Historical depth** | Full account history |
| **Real-time availability** | Yes — payment events available immediately |
| **Access model** | 🟢 OPEN — standard developer account; user authorises via OAuth |
| **Geographic scope** | US ✅ |
| **Cost to access data** | Free |
| **Mobile app** | Square has iOS and Android apps for sellers |
| **Known constraints** | Only covers Square-processed payments; user must have a Square account |

Source: [Square Payments API](https://developer.squareup.com/docs/payments-api/retrieve-payments) ✅ PRIMARY

---

### Venmo

| Attribute | Detail |
|---|---|
| **Data available** | ⚠️ No programmatic access to transaction history for new developers |
| **Public API status** | Venmo retired its developer API to new applicants in 2016. Existing OAuth API exposes only account balance and friends list — not transaction history. |
| **How QuickBooks accesses Venmo** | Via Yodlee (Intuit's data aggregation partner). Yodlee uses screen-scraping: it authenticates into the user's Venmo account with their credentials and captures transaction data from the screen. This is a B2B enterprise contract — not a developer API open to third parties. |
| **Fragility of the QuickBooks method** | Screen-scraping breaks when Venmo changes its UI, adds MFA, or updates login flows. Chronic disconnection issues are documented in QuickBooks Community forums. |
| **Access model** | ❌ CLOSED for new developers via direct API · 🔴 ENTERPRISE via Yodlee / screen-scraping aggregators (Finicity, Akoya) |
| **Alternative access path** | Venmo offers a data export (Settings → Export). The exported file contains transaction history. Format and field completeness is unverified — the actual CSV needs to be inspected before any import flow is designed around it. |
| **"Pay with Venmo" button** | A separate capability entirely. Allows a user's clients to pay them via Venmo through a checkout page you control. Does not give access to existing Venmo transaction history. Not relevant for reading past payments. |
| **Geographic scope** | US only |
| **Known constraints** | This is the single most significant data gap for S4 coaches and therapists. No clean API path exists for new developers at early stage. |

Sources: [Venmo API Retired — Fintech Futures](https://www.fintechfutures.com/digital-banking/in-resource-shift-venmo-closes-api-to-new-developers/) ✅ PRIMARY · [Venmo Developers Page](https://venmo.com/developers/) ✅ PRIMARY · [QuickBooks/Yodlee mechanism — FreeAgent Engineering](https://engineering.freeagent.com/2020/03/06/an-evolution-of-bank-feeds-from-yodlee-to-open-banking/) 🔵 SECONDARY

---

### Zelle

| Attribute | Detail |
|---|---|
| **Data available** | ⚠️ No direct consumer API; transactions are visible via bank account history |
| **Public API status** | Zelle has no API for third-party consumer app developers. It is a bank-embedded network operated by Early Warning Services. The only programmatic access is through institutional bank partnerships (e.g. JPMorgan Payments Developer Portal) — not available to startups. |
| **What is accessible** | Zelle transactions settle directly to the user's bank account and appear as individual line items in bank transaction history. A bank aggregator (Plaid, Teller) can read these as standard bank transactions — but without Venmo-style metadata such as sender name or payment note. |
| **Access model** | ❌ CLOSED for direct access · Available indirectly via bank aggregators (see Plaid/Teller below) |
| **Geographic scope** | US only |
| **Key distinction from Venmo** | Unlike Venmo (which batches payouts to the bank as a single lump sum), Zelle settles each transaction individually to the bank. This means individual Zelle payments are visible in bank feeds — the amount and date are recoverable even without a direct Zelle integration. |

Source: [Zelle via JP Morgan Payments Developer Portal](https://developer.payments.jpmorgan.com/docs/treasury/global-payments/capabilities/global-payments/zelle-disbursements) ✅ PRIMARY

---

### Plaid (Bank Account Aggregation)

*Plaid connects to a user's bank or credit union account and returns all transactions — including those originating from Zelle, ACH, wire, direct deposit, and check. It is a reading layer over the bank, not a payment processor.*

| Attribute | Detail |
|---|---|
| **Data available** | All transactions in connected accounts: amount, merchant name (raw and enriched), date, category, running balance. Covers: Zelle (individual entries), ACH, wire, direct deposit, checks, debit card purchases |
| **Does NOT cover** | Individual Venmo transactions (Venmo batches payouts to the bank as a single "Venmo" transfer — individual payments are not disaggregated) |
| **Historical depth** | Up to 24 months (varies by institution) |
| **Real-time availability** | Near real-time via webhook; new transactions typically visible within hours of settlement |
| **Access model** | 🟢 OPEN — developer account available; Plaid Link handles user-side authorisation |
| **Coverage** | 12,000+ US financial institutions ✅ |
| **Cost** | ~$1.50/user/month for transaction data (free sandbox available; production pricing by contract) |
| **Mobile SDK** | iOS, Android, React Native, Flutter — via Plaid Link |
| **Data enrichment** | Plaid Enrich adds cleaned merchant names, logos, and category taxonomy — billed separately per enriched transaction |
| **Known constraints** | ~15–25% of connections require annual re-authentication by the user; smaller banks may use screen-scraping fallback (less stable); cost grows with user base |

Sources: [Plaid Transactions](https://plaid.com/products/transactions/) · [Plaid Enrich](https://plaid.com/docs/enrich/) · [Plaid Pricing](https://plaid.com/pricing/) ✅ PRIMARY · Cost analysis via [Protonbits](https://www.protonbits.com/how-much-does-plaid-cost/) 🔵 SECONDARY

---

### Teller.io (Bank Account Aggregation — Plaid Alternative)

| Attribute | Detail |
|---|---|
| **Data available** | Same as Plaid — all settled bank transactions, account balances, identity |
| **Key difference from Plaid** | Teller uses native bank API connections only (no screen scraping). Developers report faster response times and a cleaner API surface. |
| **Access model** | 🟢 OPEN — US only (not a constraint given locked decision D#4) |
| **Coverage** | US financial institutions — smaller network than Plaid but growing |
| **Cost** | Not publicly listed; reported as more affordable than Plaid at low scale |
| **Mobile SDK** | iOS, Android, React Native via Teller Connect |
| **Known constraints** | Smaller ecosystem than Plaid; fewer pre-built third-party integrations |

Source: [Teller.io](https://teller.io) ✅ PRIMARY · [Teller vs Plaid Comparison](https://www.protonbits.com/teller-vs-plaid/) 🔵 SECONDARY

---

### Upwork

| Attribute | Detail |
|---|---|
| **Data available** | ⚠️ PARTIAL — engagement billing data available; earnings reports restricted for some account types |
| **Access model** | 🟢 OPEN (GraphQL API, OAuth) — but earnings data has account-type restrictions |
| **Relevance** | S2 tech freelancers who source work via Upwork; niche within segment — most direct freelancers work outside platforms |
| **Known constraints** | Agency contractors cannot access earnings reports via API. Individual contractor access varies. |

Source: [Upwork Developer Documentation](https://www.upwork.com/developer/documentation/graphql/api/docs/index.html) ✅ PRIMARY

---

### Payment Received — Source Summary

| Source | Data available | Access model | Cost | Covers Zelle? | Covers Venmo? |
|---|---|---|---|---|---|
| Stripe | Full transaction detail incl. fees | 🟢 Open | Free | ❌ | ❌ |
| PayPal | Full transaction detail incl. fees | 🟡 Partner required | Free | ❌ | ❌ |
| Square | Full transaction detail incl. fees | 🟢 Open | Free | ❌ | ❌ |
| Venmo | None (API retired) | ❌ Closed / 🔴 Enterprise (Yodlee) | N/A | N/A | ❌ Direct; CSV export only |
| Zelle | None directly | ❌ Closed | N/A | — | N/A |
| Plaid (bank) | All settled bank transactions | 🟢 Open | ~$1.50/user/mo | ✅ (as bank entry) | ⚠️ Lump sum only |
| Teller.io (bank) | All settled bank transactions | 🟢 Open | Lower than Plaid | ✅ (as bank entry) | ⚠️ Lump sum only |
| Upwork | Partial earnings | 🟢 Open (restricted) | Free | ❌ | ❌ |

---

## ACTIVITY 2: EXPENSE LOGGING

*What data sources know about money a freelancer spent.*

---

### Bank / Credit Card Feed (Plaid or Teller)

| Attribute | Detail |
|---|---|
| **Data available** | All debit and credit card transactions: merchant name, amount, date, raw and enriched category |
| **What it covers** | Every charge made to connected cards or bank accounts — SaaS subscriptions, travel, meals, equipment, phone, internet |
| **What it does not cover** | Cash purchases; expenses on cards or accounts the user has not connected; Venmo payments to others |
| **Category data** | Plaid provides a category taxonomy (e.g. Software, Travel, Food) — accuracy varies; user correction commonly needed |
| **Access model** | 🟢 OPEN — same connection as Activity 1 (one bank connection covers both income and expense data) |
| **Cost** | Included in Plaid/Teller transaction pricing — no additional cost for expenses vs. income |

Source: [Plaid Transactions](https://plaid.com/docs/transactions/) · [Plaid Enrich](https://plaid.com/docs/enrich/) ✅ PRIMARY

---

### Email Receipts — Gmail (Google)

| Attribute | Detail |
|---|---|
| **Data available** | All emails in the user's Gmail inbox: sender, subject, body, attachments (including PDF receipts) |
| **What it covers** | SaaS billing emails (Adobe CC, Figma, AWS, GitHub), travel booking confirmations, hotel and airline receipts, online purchase receipts |
| **Access model** | 🟢 OPEN — Google OAuth; user grants read-only access to Gmail |
| **Geographic scope** | Global — Gmail is the dominant email provider for this user segment |
| **Cost** | Google provides the Gmail API free at scale |
| **Known constraints** | Gmail users only; structured data extraction from email bodies requires a separate parsing layer; accuracy of extraction varies by email format |

Source: [Gmail API — Google Developers](https://developers.google.com/gmail/api/guides) ✅ PRIMARY

---

### Email Receipts — Outlook / Microsoft 365 (Microsoft Graph API)

| Attribute | Detail |
|---|---|
| **Data available** | Same as Gmail API — email body, sender, subject, attachments |
| **Access model** | 🟢 OPEN — Microsoft OAuth (Azure AD) |
| **Relevance** | S3 consultants are most likely to use Outlook/Microsoft 365 (ex-corporate background) |
| **Known constraints** | Separate integration from Gmail; cannot use a single email API for both |

Source: [Microsoft Graph API](https://learn.microsoft.com/en-us/graph/overview) ✅ PRIMARY

---

### Receipt OCR — Image / Camera Capture

For paper receipts or receipts that arrive as images rather than emails.

| Provider | What it extracts | Accuracy (receipts) | Native mobile capture | Free tier | Paid tier | Access model |
|---|---|---|---|---|---|---|
| **Veryfi** | Merchant, amount, date, line items, tax, currency — structured JSON output | 98.7% ⚠️ (self-reported benchmark) | ✅ iOS + Android SDK (Veryfi Lens) | 100 documents lifetime | $500/month minimum | 🟢 Open |
| **Mindee** | Same fields as Veryfi | 96.1% ⚠️ (Mindee-reported) | REST API only (no native mobile SDK) | 250 pages/month | Pay-per-page | 🟢 Open |
| **AWS Textract** | Strong on structured forms and tables; weaker on freeform receipts | Competitive | Via AWS mobile SDK | Pay-per-page | Pay-per-page | 🟢 Open |
| **Google Cloud Vision** | General OCR — text extraction from any image | 94.3% ⚠️ (Veryfi-reported benchmark) | Via Google Cloud mobile SDK | 1,000 units/month free | Pay-per-unit | 🟢 Open |

*Note: All accuracy figures above come from vendor-produced or vendor-cited benchmarks. No fully independent, peer-reviewed comparison was found. Treat as directional. Sources: [MarkTechPost OCR Comparison Nov 2025](https://www.marktechpost.com/2025/11/02/comparing-the-top-6-ocr-optical-character-recognition-models-systems-in-2025/) 🔵 SECONDARY · [Veryfi self-benchmark](https://www.veryfi.com/ai-insights/invoice-ocr-competitors-veryfi/) ⚠️ SELF-REPORTED*

---

### Manual / Import Fallback

| Method | What it covers | Notes |
|---|---|---|
| User manual entry | Any expense with no digital trail — cash, informal payments | Always available as fallback |
| Bank CSV import | User downloads and uploads bank statement | Covers any bank not supported by Plaid/Teller |
| Platform statement import | User exports annual statement from Venmo, PayPal, etc. | Only path for Venmo; format unverified |

---

### Expense Logging — Source Summary

| Source | What it covers | Auto capture possible? | Access model | Cost |
|---|---|---|---|---|
| Plaid / Teller (bank + card feed) | All card and bank debit transactions | ✅ Yes | 🟢 Open | ~$1.50/user/mo |
| Gmail API | SaaS and merchant email receipts | ✅ Yes (after connection) | 🟢 Open | Free |
| Microsoft Graph (Outlook) | Same as Gmail, for Outlook users | ✅ Yes (after connection) | 🟢 Open | Free |
| Veryfi (OCR) | Paper receipts and image-based receipts | Semi (user captures photo) | 🟢 Open | $500/mo min |
| Mindee / AWS Textract / Google Vision (OCR) | Paper receipts and uploaded images | Semi (user uploads image) | 🟢 Open | Pay-per-page |
| Manual entry / CSV import | Cash, Venmo, unsupported sources | Manual only | N/A | Free |

---

## ACTIVITY 3: RECONCILIATION

*What data is needed to match platform-reported income against bank-received income against IRS-reported figures.*

Reconciliation is not a single source — it is a product of combining sources already listed above. This section maps which sources provide which piece of each reconciliation problem.

---

### Reconciliation Problem 1: Gross vs. Net Income (Critical for S4)

Payment processors report *gross* income to the IRS via 1099-K. The freelancer receives *net* (after platform fees are deducted). For taxes to be correct, both figures must be known — and the gap between them is a deductible expense.

| Data needed | Source | Access |
|---|---|---|
| Gross income per platform | Stripe, PayPal, Square — transaction data | See Activity 1 above |
| Platform fees per platform | Stripe, PayPal, Square — fee fields within each transaction record | Same sources |
| Net received in bank | Plaid or Teller — bank deposit data | See Activity 1 above |

All three are available via API for Stripe, Square, and PayPal (with partner status). Venmo remains the gap.

---

### Reconciliation Problem 2: Multi-Platform Aggregation (Critical for S4)

A freelancer receiving payments across 4–6 platforms needs a single, consolidated income figure.

| Platform | Source for income data | Gap? |
|---|---|---|
| Stripe | Stripe API | None |
| PayPal | PayPal API | Partner approval required |
| Square | Square API | None |
| Zelle | Plaid / Teller bank feed | Amount recoverable; sender metadata lost |
| Venmo | No API | ❌ Only CSV export or manual entry |
| ACH / Wire | Plaid / Teller bank feed | None |
| Check | Plaid / Teller bank feed | None |
| Cash | No source | ❌ Manual only |

---

### Reconciliation Problem 3: 1099-K Threshold Monitoring (S2, S3, S4)

Payment processors are required to file a 1099-K with the IRS when a user exceeds the annual threshold ($5,000 gross in 2024, phased from $20,000). The freelancer needs to know when each platform will file.

| Platform | YTD gross data available? | Source |
|---|---|---|
| Stripe | ✅ Yes — via transaction history | Stripe API |
| PayPal | ✅ Yes — via transaction history | PayPal API (partner required) |
| Square | ✅ Yes — via payment history | Square API |
| Venmo | ❌ No API | CSV export / manual |

IRS threshold source: [IRS — Understanding Form 1099-K](https://www.irs.gov/businesses/understanding-your-form-1099-k) ✅ PRIMARY

---

### Reconciliation Problem 4: 1099-NEC Received Matching (S2, S3, S4)

Clients who paid a freelancer $600+ in a year are required to send a 1099-NEC by January 31. The freelancer must confirm all expected 1099-NECs were received and match their income records.

| Data needed | Source | API? |
|---|---|---|
| List of clients who paid $600+ | Invoice records + payment data | Available from sources above |
| Confirmation that 1099-NEC was received | ❌ None | Manual — 1099s arrive by mail or email; no IRS API for this |

1099-NEC is manual by nature at the individual freelancer level.

---

### Reconciliation — Source Summary

| Reconciliation task | Sources needed | Fully API-accessible? |
|---|---|---|
| Gross vs. net per platform | Stripe + PayPal + Square APIs; Plaid bank feed | ✅ Yes (Venmo excepted) |
| Total income across all platforms | All payment APIs + Plaid/Teller for Zelle + ACH | ⚠️ Partial — Venmo gap remains |
| 1099-K threshold monitoring per platform | Stripe + PayPal + Square YTD data | ⚠️ Partial — Venmo gap remains |
| Platform fees as deductible expenses | Fee fields within Stripe, PayPal, Square transaction records | ✅ Yes |
| 1099-NEC received confirmation | No source | ❌ Manual only |

---

## ACTIVITY 4: INVOICE CREATION / FOLLOW-UP

*What sources support creating, delivering, tracking, and chasing invoices.*

---

### Stripe Invoicing

| Attribute | Detail |
|---|---|
| **What it offers** | Full invoice lifecycle: creation, delivery to client by email, payment status tracking, PDF generation, automatic payment reminders, partial payment support |
| **Payment collection** | Stripe generates a hosted payment link — client pays by card or bank transfer via that link |
| **Branding** | Custom logo, colours, footer text supported |
| **Data returned** | Invoice status (draft / sent / paid / void / overdue), payment date, amount paid, client information |
| **Access model** | 🟢 OPEN — user must have a Stripe account; app connects via OAuth |
| **Cost** | 0.4% per invoice paid through Stripe Invoicing (capped at $2 per invoice); creating and reading invoices is free |
| **Mobile** | Stripe has iOS and Android apps where users can view invoice status |
| **Known constraints** | User must have or create a Stripe account; client pays through Stripe's payment page (some clients may resist) |

Source: [Stripe Invoicing](https://docs.stripe.com/invoicing) · [Stripe Invoice API Reference](https://docs.stripe.com/api/invoices) ✅ PRIMARY

---

### Invoice Delivery — Email Services

For sending invoices that are created independently (outside of Stripe).

| Service | What it offers | Free tier | Paid tier | Access model |
|---|---|---|---|---|
| **SendGrid** | Transactional email delivery, delivery tracking, open/click events | 100 emails/day | $19.95/mo (50K emails) | 🟢 Open |
| **Postmark** | Transactional email delivery, high deliverability focus, delivery confirmation | 100 emails/mo | $15/mo (10K emails) | 🟢 Open |
| **AWS SES** | High-volume email delivery, lowest cost per email at scale | None | $0.10 per 1,000 emails | 🟢 Open |
| **Mailgun** | Transactional email with validation and tracking | 100 emails/day | $35/mo (50K emails) | 🟢 Open |

Sources: [SendGrid Pricing](https://sendgrid.com/pricing) · [Postmark Pricing](https://postmarkapp.com/pricing) 🔵 SECONDARY

---

### Invoice Follow-up — SMS

| Service | What it offers | Cost | Access model |
|---|---|---|---|
| **Twilio** | Programmable SMS to any US phone number; scheduled sends; two-way messaging | $0.0079/outbound SMS · $1/mo per number | 🟢 Open |
| **Amazon SNS** | SMS delivery at scale; lower cost at volume | $0.00645/SMS in US | 🟢 Open |
| **Vonage (Nexmo)** | SMS + voice; global coverage | $0.0065/SMS in US | 🟢 Open |

Source: [Twilio SMS Pricing US](https://www.twilio.com/en-us/sms/pricing/us) ✅ PRIMARY

---

### Invoice Follow-up — WhatsApp Business

| Attribute | Detail |
|---|---|
| **What it offers** | Programmatic messaging via WhatsApp to any WhatsApp user |
| **Access model** | 🟡 PARTNER — requires Meta Business verification and WhatsApp Business API access approval |
| **Cost** | Variable; Meta charges per conversation (~$0.01–$0.05 depending on category) |
| **Relevance** | Low for US-only context; more relevant for freelancers with international clients |

---

### PDF Generation (for invoices not sent via Stripe)

For freelancers who collect payment outside Stripe and need a standalone invoice document.

| Tool | What it offers | Cost | Access model |
|---|---|---|---|
| **PDFKit** | Open-source PDF generation from code | Free | 🟢 Open |
| **Puppeteer / Playwright** | Converts HTML/web pages to PDF | Free | 🟢 Open |
| **DocuSign** | Invoice + contract e-signature combined | $25+/mo | 🟡 Partner |
| **HelloSign (Dropbox Sign)** | Lighter-weight e-signature for invoice acceptance | $15+/mo | 🟢 Open |

---

### Invoice Creation / Follow-up — Source Summary

| Capability | Best available source | Access model | Cost |
|---|---|---|---|
| Invoice creation with payment collection | Stripe Invoicing | 🟢 Open | 0.4% per invoice paid |
| Invoice creation (standalone PDF) | PDFKit / Puppeteer | 🟢 Open | Free |
| Invoice delivery by email | Stripe native / SendGrid / Postmark | 🟢 Open | Free to low |
| Invoice payment status tracking | Stripe invoice object | 🟢 Open | Free |
| Invoice status from bank (non-Stripe) | Plaid / Teller — match incoming payment amount to open invoice | 🟢 Open | Included in bank feed cost |
| Late payment follow-up — email | SendGrid / Postmark | 🟢 Open | Free to low |
| Late payment follow-up — SMS | Twilio / Amazon SNS | 🟢 Open | ~$0.01/message |
| Late payment follow-up — WhatsApp | Meta WhatsApp Business API | 🟡 Partner | ~$0.01–$0.05/conversation |
| Invoice + contract combined | DocuSign / HelloSign | 🟢–🟡 | $15–25+/mo |

---

## KNOWN GAPS — Where No Clean API Exists

| Gap | Affects | What is known |
|---|---|---|
| **Venmo transaction history** | S4 heaviest; also S1, general | No public API for new developers. QuickBooks uses Yodlee screen-scraping (enterprise B2B contract). Only options at early stage: Venmo CSV export (format unverified) or manual entry. |
| **Zelle sender metadata** | S4 | Zelle amounts are visible via bank feed. Sender name and payment purpose are not transmitted to the bank — they are lost in settlement. |
| **1099-NEC receipt confirmation** | S2, S3, S4 | IRS does not offer an API for individual freelancers to verify 1099-NEC receipt. This is manual by nature. |
| **Cash income** | All segments | No source. Manual entry only. |
| **Venmo CSV export format** | S4 | Venmo offers a data export in Settings. Actual field names, data quality, and completeness are unverified — the file must be inspected directly before any import flow is designed. |

---

## SOURCES INDEX

| # | Source | URL | Confidence |
|---|---|---|---|
| 1 | Stripe Balance Transactions API | [docs.stripe.com/api/balance_transactions/list](https://docs.stripe.com/api/balance_transactions/list) | ✅ PRIMARY |
| 2 | Stripe Invoicing | [docs.stripe.com/invoicing](https://docs.stripe.com/invoicing) | ✅ PRIMARY |
| 3 | PayPal Transaction Search API | [developer.paypal.com/docs/transaction-search](https://developer.paypal.com/docs/transaction-search/) | ✅ PRIMARY |
| 4 | Square Payments API | [developer.squareup.com/docs/payments-api/retrieve-payments](https://developer.squareup.com/docs/payments-api/retrieve-payments) | ✅ PRIMARY |
| 5 | Venmo API Retired — Fintech Futures | [fintechfutures.com](https://www.fintechfutures.com/digital-banking/in-resource-shift-venmo-closes-api-to-new-developers) | ✅ PRIMARY |
| 6 | Venmo Developers Page | [venmo.com/developers](https://venmo.com/developers/) | ✅ PRIMARY |
| 7 | Yodlee / screen-scraping explanation | [FreeAgent Engineering](https://engineering.freeagent.com/2020/03/06/an-evolution-of-bank-feeds-from-yodlee-to-open-banking/) | 🔵 SECONDARY |
| 8 | Zelle via JP Morgan Payments Portal | [developer.payments.jpmorgan.com](https://developer.payments.jpmorgan.com/docs/treasury/global-payments/capabilities/global-payments/zelle-disbursements) | ✅ PRIMARY |
| 9 | Plaid Transactions | [plaid.com/products/transactions](https://plaid.com/products/transactions/) | ✅ PRIMARY |
| 10 | Plaid Enrich | [plaid.com/docs/enrich](https://plaid.com/docs/enrich/) | ✅ PRIMARY |
| 11 | Plaid Pricing | [plaid.com/pricing](https://plaid.com/pricing/) | ✅ PRIMARY |
| 12 | Plaid Pricing Analysis | [protonbits.com/how-much-does-plaid-cost](https://www.protonbits.com/how-much-does-plaid-cost/) | 🔵 SECONDARY |
| 13 | Teller.io | [teller.io](https://teller.io) | ✅ PRIMARY |
| 14 | Teller vs Plaid | [protonbits.com/teller-vs-plaid](https://www.protonbits.com/teller-vs-plaid/) | 🔵 SECONDARY |
| 15 | Upwork Developer API | [upwork.com/developer](https://www.upwork.com/developer) | ✅ PRIMARY |
| 16 | Gmail API | [developers.google.com/gmail/api/guides](https://developers.google.com/gmail/api/guides) | ✅ PRIMARY |
| 17 | Microsoft Graph API | [learn.microsoft.com/en-us/graph/overview](https://learn.microsoft.com/en-us/graph/overview) | ✅ PRIMARY |
| 18 | Veryfi Receipt OCR | [veryfi.com/receipt-ocr-api](https://www.veryfi.com/receipt-ocr-api/) | ✅ PRIMARY |
| 19 | Veryfi Pricing | [veryfi.com/pricing](https://www.veryfi.com/pricing/) | ✅ PRIMARY |
| 20 | Veryfi Lens SDK | [veryfi.com/sdk](https://www.veryfi.com/sdk/) | ✅ PRIMARY |
| 21 | OCR Accuracy Comparison — MarkTechPost 2025 | [marktechpost.com](https://www.marktechpost.com/2025/11/02/comparing-the-top-6-ocr-optical-character-recognition-models-systems-in-2025/) | 🔵 SECONDARY |
| 22 | Veryfi OCR Benchmark (self-reported) | [veryfi.com/ai-insights/invoice-ocr-competitors-veryfi](https://www.veryfi.com/ai-insights/invoice-ocr-competitors-veryfi/) | ⚠️ SELF-REPORTED |
| 23 | Twilio SMS Pricing | [twilio.com/en-us/sms/pricing/us](https://www.twilio.com/en-us/sms/pricing/us) | ✅ PRIMARY |
| 24 | IRS — Understanding Form 1099-K | [irs.gov/businesses/understanding-your-form-1099-k](https://www.irs.gov/businesses/understanding-your-form-1099-k) | ✅ PRIMARY |

---

**LEARN:** The access model column is the most decision-relevant field in this document. Open sources (Stripe, Square, Plaid, Gmail, Twilio) can be explored in sandbox immediately with no approvals. Partner-gated sources (PayPal, WhatsApp) have lead time that is invisible until you hit the gate. Enterprise sources (Yodlee, Finicity) are not available to early-stage products without a business development process. Knowing which tier each source sits in before architecture decisions are made prevents wasted engineering.

**NEXT:** Three facts that are currently unverified and affect source decisions: (1) Venmo CSV export — what fields does it actually contain? Download one and inspect it. (2) PayPal partner application — what does approval require and how long does it take? The developer portal describes the process; the actual approval timeline is not documented publicly. (3) Plaid vs. Teller connection rates — which aggregator achieves higher stable connection rates for Chase, Bank of America, and Wells Fargo specifically (the three most common banks in this segment)? Community comparisons exist; no published independent benchmark was found.
