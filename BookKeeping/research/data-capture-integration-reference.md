# Data Capture & Ledger Integration — Complete Reference

> **STATUS: RESEARCH REFERENCE — NOT CURRENT STRATEGY**
> This document was created as early-stage research exploring integration options. The ledger strategy has since been decided: **Penny owns its own ledger from day one.** QuickBooks, Xero, and Wave are export targets — not the system of record. See `architecture/system-architecture.md` for the settled architecture.
> The data capture sections (Parts 1 and 2) remain valid and useful reference material. The ledger integration strategy (Parts 3–5) should be read as historical exploration, not current direction.

> **Original scope:** This document maps every source of financial data a small business generates, how that data can be captured by the product, and the options for integrating with or replacing existing bookkeeping ledgers. It is structured as a decision reference for product and technical planning — not a final recommendation.

---

## Part 1: Where Financial Data Lives

Before building anything, it helps to inventory every place a small business's financial data actually exists. There are more sources than most people realize — and each has different capture characteristics.

### 1.1 Bank Accounts

**What's there:** Every transaction that hits the business bank account — deposits, withdrawals, transfers, fees, ACH payments, check clearances.

**The gold standard of financial data.** Bank records are the authoritative source — they're what reconciliation is measured against. Every bookkeeping process ultimately traces back to the bank statement.

**How current it is:** Real-time (intraday) to 1–2 business days delayed, depending on access method.

**Formats available:**
- OFX / QFX files — downloadable, machine-readable, used by Quicken and older tools
- CSV / Excel exports — downloadable from most bank portals
- PDF statements — monthly, human-readable but machine-unfriendly
- API (direct bank API or aggregator) — best for real-time access

**Coverage reality:** The US has ~4,500 commercial banks and ~4,700 credit unions. No single API covers all of them. Aggregators (see Part 2) solve this through screen-scraping and bank partnerships.

---

### 1.2 Business Credit Cards

**What's there:** All purchases made on the business card — vendor name, amount, date, sometimes a category from the card network.

**Similar to bank accounts but separate.** Each card account needs its own reconciliation. A business with 3 credit cards has 3 additional reconciliations per month.

**Nuance:** Credit card statements show the *charge date*, not the *settlement date* — which can differ. Card networks (Visa, Mastercard, Amex) sometimes provide enhanced merchant data (actual merchant name, category code, even address) beyond what the owner typed when they signed up for the card.

**Access formats:** Same as bank accounts — OFX/QFX, CSV, PDF, or API via aggregator.

---

### 1.3 Payment Processors

**What's there:** Every payment the business accepted — amount, customer, date, fee deducted, net payout. Different from the bank account because it shows pre-fee gross revenue.

**Key players:**
- **Square** — very common for in-person businesses. Has a rich API. Provides itemized sales data, not just totals. Also covers Afterpay and BNPL.
- **Stripe** — common for online and service businesses. The most developer-friendly API in this space. Provides payment, payout, refund, and dispute data.
- **PayPal** — still widely used, especially older businesses. API access available. Data quality is uneven — personal PayPal used for business is a mess.
- **Venmo for Business** — increasingly used but data portability is limited.
- **Clover, Toast, Lightspeed** — POS systems with integrated payments, common in restaurants and retail. APIs available for each.
- **Shopify Payments** — for e-commerce businesses.

**Why this matters:** A payment processor shows gross revenue before fees. The bank account shows the net payout after the processor takes its cut. Both are needed to accurately record revenue and the associated merchant processing fees as a deductible expense.

---

### 1.4 Mobile Payment Apps (Zelle, Venmo, Cash App)

**What's there:** Peer-to-peer payments received or sent — often with no invoice reference, often mixed personal and business.

**The hardest category to work with.** These apps were designed for personal use. Business use is increasingly common but data access is poor.

**Zelle:** No standalone API. Transactions appear in the bank account as ACH transfers. The sender name is the only identifier — which may be a person's name, not a business name.

**Venmo:** Venmo for Business has a limited API. Personal Venmo used for business has no business API. Transactions are visible in the app and can be exported as CSV.

**Cash App for Business:** Has a business account variant with basic reporting, but no production API for third-party apps.

**The practical reality:** These payment types must be captured through a combination of bank feed monitoring (to catch the incoming ACH/transfer) and owner confirmation (to identify which customer or invoice it relates to).

---

### 1.5 Receipts and Invoices

**What's there:** The source documents that prove a transaction happened and what it was for. These exist as:
- Paper receipts (crumpled, faded, lost)
- Email PDFs (confirmation emails, invoices from vendors)
- Photos taken by the owner (varying quality)
- E-receipts (digital receipts from Square, Shopify, etc. — often emailed automatically)
- Invoice PDFs created by the owner's invoicing tool
- Paper invoices from suppliers

**This is where AI has the highest leverage.** A receipt photograph contains the vendor name, amount, date, and often the line items — all extractable via OCR and AI parsing. The technology for this is mature and reliable.

**Tools that already do this:** Dext (formerly Receipt Bank), AutoEntry, Hubdoc, Expensify. These are receipt-capture-focused tools that feed data into QuickBooks and Xero.

---

### 1.6 Payroll Systems

**What's there:** Gross wages, employer taxes, net pay, and payroll tax liabilities — broken down by employee. Also: contractor payments if processed through the system.

**Key players:**
- **Gusto** — very common for small businesses. Has a strong API. Provides full payroll journal entries.
- **ADP, Paychex** — larger, more established. APIs exist but are less open.
- **QuickBooks Payroll** — integrated into QuickBooks.
- **Wave Payroll** — free or very cheap for small businesses.

**Important boundary:** Bookkeeping records payroll as an expense (gross wages, employer taxes). The bookkeeper does not run payroll — that's a separate system. But the bookkeeper needs the journal entry from payroll to record it correctly.

---

### 1.7 E-Commerce Platforms

**What's there:** Sales orders, refunds, shipping costs, platform fees, inventory changes. For businesses that sell online, this is a major source of revenue data.

**Key players:**
- **Shopify** — excellent API, widely used, has a native accounting integration ecosystem
- **WooCommerce / Etsy / Amazon Seller** — all have API access of varying quality
- **eBay** — has an API; data quality for accounting purposes is moderate

**The challenge:** E-commerce creates high transaction volume with many small amounts. A business with 200 sales/month has very different data needs than a contractor who invoices 8 clients. The bookkeeping approach must scale to transaction volume.

---

### 1.8 Mileage and Vehicle

**What's there:** Business miles driven — date, destination, purpose. Required by the IRS for vehicle expense deductions.

**The IRS mileage deduction** (2024: 67 cents/mile) requires a written log. A verbal estimate is not acceptable. Most SMB owners track this poorly or not at all.

**Available data sources:**
- GPS / phone location data (with permission) — can auto-detect trips
- Manual log entry
- Dedicated apps: MileIQ, Everlance, TripLog — these already solve this well

**Product angle:** Auto-detecting trips and prompting the owner to classify (business or personal?) is a solved problem. Worth integrating with an existing mileage API rather than building from scratch.

---

### 1.9 Existing Accounting Software

**What's there:** If the business already uses QuickBooks, Xero, Wave, or FreshBooks, there's an existing ledger with historical transaction data, chart of accounts, customer records, and prior-year reports.

**This is the critical integration point.** Early adopters will almost certainly have some existing bookkeeping software. The product must either integrate with what they have or provide a migration path.

Covered in detail in Part 3.

---

## Part 2: How to Capture the Data

### 2.1 Bank & Card Feed Aggregators

These services connect to thousands of banks and provide a unified API to access transaction data. This is the core infrastructure layer for any modern bookkeeping product.

**Option A: Plaid**
- The dominant player. Connects to 12,000+ financial institutions in the US.
- Products relevant to bookkeeping: Transactions (bank/card feed), Liabilities (credit card balances), Identity (account verification)
- Data quality: Generally excellent for major banks. Regional banks and credit unions are less reliable.
- Pricing: Per-item (per connected institution) pricing. Roughly $0.30–0.50/connected account/month at small scale, negotiable at volume.
- Latency: Transactions available within 1–2 days. Real-time webhooks for new transactions.
- Controversy: Some banks have blocked or degraded Plaid access. JPMorgan Chase, Bank of America, and others have had tensions with Plaid. This is improving as open banking regulations develop.
- Best for: Startups. Fast to implement. Widest coverage.

**Option B: MX Technologies**
- Strong alternative to Plaid. Similar coverage, different pricing model.
- Better institutional relationships with some banks. Less friction with Chase and BofA.
- Also provides data enrichment — merchant name cleaning, categorization.
- Better suited for a more enterprise positioning.

**Option C: Finicity (acquired by Mastercard)**
- Strong coverage, especially for lenders. Less common for pure bookkeeping applications.
- Has FDX (Financial Data Exchange) compliance — the emerging open banking standard in the US.

**Option D: Direct bank APIs**
- Some major banks (Chase, Bank of America, Wells Fargo) have started offering direct API access for business customers.
- Better data quality and reliability than aggregators for supported banks.
- Very limited coverage — works only for the specific bank.
- Worth layering on top of an aggregator as a quality upgrade.

**Recommendation for MVP:** Start with Plaid. It's the fastest path to broad coverage. Plan to add MX as a fallback for accounts where Plaid has gaps.

---

### 2.2 Receipt Capture

**Option A: Mobile camera + AI OCR**
The owner photographs a receipt with their phone. The product extracts vendor name, date, and amount via OCR and AI parsing.

- Technology: Google Cloud Vision API, AWS Textract, or Azure Computer Vision for OCR. GPT-4o or similar for intelligent extraction.
- Accuracy: ~90–95% for clear photos of standard receipts. Lower for handwritten, faded, or crumpled receipts.
- Cost: Fractions of a cent per extraction at scale. Google Cloud Vision is ~$1.50 per 1,000 images.
- User behavior: This only works if the owner photographs the receipt immediately. The more steps between the purchase and the capture, the lower the completion rate.

**Option B: Email forwarding**
The owner forwards receipt emails (Amazon, vendor confirmations, etc.) to a dedicated address. The product parses the email.

- Works extremely well for e-receipts that are already formatted and structured.
- Email parsing is more reliable than image OCR because the data is already text.
- Common pattern: owner sets a filter rule to auto-forward any email from known vendors.
- Technology: Standard email parsing APIs; many email providers have webhooks.

**Option C: Gmail / Outlook integration**
The product connects to the owner's email and automatically pulls relevant receipts, invoices, and bank notifications.

- Requires OAuth access to the owner's email — a significant trust/permission request.
- Can be very powerful: automatically detects e-commerce confirmations, utility bills, vendor invoices.
- Privacy concern is real. Many users will be uncomfortable granting email access.
- Best implemented as an opt-in after trust is established.

**Option D: Built-in camera with smart capture**
A camera experience within the product app that guides the owner to capture the receipt correctly — edge detection, auto-crop, quality check before submission.

- Reduces the blurry/incomplete receipt problem.
- Adds development complexity but meaningfully improves data quality.

**Recommendation for MVP:** Mobile camera + email forwarding as the two primary capture paths. Gmail integration as a later trust-building feature.

---

### 2.3 Invoice Data Capture

Invoices sent by the business are generated by the product (if built-in) or imported from an existing invoicing tool.

**If the product includes invoicing:**
- Every invoice created is automatically a data source — customer, amount, line items, due date
- Payment matching becomes automatic when the payment arrives via bank feed

**If the business uses an external tool (QuickBooks, FreshBooks, Wave invoicing):**
- API integration with those tools to pull invoice data
- QuickBooks: full REST API. FreshBooks: REST API. Wave: GraphQL API.

---

### 2.4 Payment Processor Integrations

Each processor has its own integration path:

**Square:** REST API. Provides sales, payments, refunds, and payouts. Webhook support for real-time events. OAuth for authorization (no credential storage).

**Stripe:** The gold standard for API design. Webhooks are first-class. Provides charges, payouts, fees, and disputes. Easy to integrate.

**PayPal:** REST API available. More complex data model. Personally used PayPal mixed with business is a significant problem with no clean technical solution.

**Others (Clover, Toast, etc.):** APIs exist but are less standardized. Lower priority for MVP unless targeting specific industries.

---

### 2.5 Manual Entry (Fallback)

For transactions that have no digital trail — cash payments, personal card used for business, informal vendor agreements — the product must provide a fast manual entry path.

**Design principle:** Manual entry should feel like sending a text message, not filling out a form. The minimum viable capture for any transaction is: amount, purpose, and approximate date. Everything else can be inferred or filled in later.

---

## Part 3: Ledger Integration Strategy

This is the most consequential technical and strategic decision in the product. Three broad options exist.

---

### 3.1 Option A: Integrate with Existing Ledgers (Near-Term Path)

The product acts as a front-end layer on top of an existing accounting platform — QuickBooks Online, Xero, or Wave. The AI captures, categorizes, and prepares data. The existing platform stores it.

**Platforms and their APIs:**

**QuickBooks Online (QBO)**
- Market leader for US SMBs. Roughly 35–40% of small businesses that use accounting software use QuickBooks.
- Full REST API covering: accounts, transactions, invoices, bills, payments, bank feeds, reports.
- OAuth 2.0 authorization — no password storage.
- Intuit Developer Program: requires app approval for production access. Review process takes weeks.
- Sandbox environment available for development.
- Webhook support for real-time event notification.
- API rate limits: 500 requests per minute. Can be a constraint at scale.
- The ledger's Chart of Accounts can be customized — the product can read and write to the owner's actual categories.
- **Critical limitation:** Intuit has historically been protective of QuickBooks and has competed with apps in its own ecosystem. Dependency risk is real.

**Xero**
- Second most popular US SMB accounting platform. Stronger in UK, Australia, New Zealand.
- Excellent REST API. Generally considered more developer-friendly than QuickBooks.
- Strong bank feed API — can push transactions directly.
- OAuth 2.0. App marketplace listing available (increases discovery).
- Webhook support.
- More open ecosystem culture than Intuit.

**Wave**
- Free accounting software. Popular with sole proprietors and very small businesses.
- GraphQL API. Less mature than QuickBooks or Xero APIs.
- Smaller integration partner ecosystem.
- Acquired by H&R Block in 2019. Strategic direction has shifted somewhat.
- Lower barrier for early users (free platform = lower switching cost for them).

**FreshBooks**
- Popular with freelancers and small service businesses. Strong invoicing focus.
- REST API. Less full-featured ledger than QuickBooks or Xero.
- Good fit if targeting service-based sole proprietors early.

**Advantages of this approach:**
- Fastest to market — no ledger to build
- Owner's existing data stays where it is
- Accountant already has access to the owner's QuickBooks or Xero — no workflow disruption
- Reduces risk: if the product fails, nothing is lost; the ledger is still intact

**Disadvantages:**
- Product is dependent on a third-party platform
- API limitations constrain what the product can do
- Intuit specifically has a history of acquiring or competing with successful integrations
- The product can't own the full user experience
- Integration maintenance is ongoing engineering cost as APIs evolve

**Best for MVP:** This is the right first step. Integrate with QuickBooks Online and optionally Xero. Position the product as the "front door" to the owner's books — making the experience of bookkeeping effortless — while the existing ledger remains the system of record.

---

### 3.2 Option B: Build on an Embedded Ledger (Medium-Term)

Rather than integrating with QuickBooks or Xero, the product builds its own double-entry ledger — but using an embedded ledger-as-a-service platform rather than building from scratch.

**What "embedded ledger" means:** A purpose-built API or library that handles the accounting primitives (journal entries, debits/credits, account balances, financial reports) without requiring the developer to understand accounting rules at a deep level.

**Available platforms:**

**Ledge (ledge.co)**
- Purpose-built embedded ledger API for fintech products
- Handles double-entry accounting primitives
- US-focused

**Modern Treasury**
- Strong for money movement and reconciliation, less focused on full bookkeeping
- More appropriate for payments-oriented products

**Campfire**
- Newer entrant specifically targeting AI bookkeeping products
- Worth evaluating

**Building a minimal custom ledger (SQLite/Postgres)**
- A double-entry ledger at its core is a simple concept: a table of journal entries with debit/credit pairs
- Many startups build a basic version in-house before it becomes a bottleneck
- Risk: accounting edge cases (multi-currency, deferred revenue, depreciation) accumulate complexity quickly

**Advantages of this approach:**
- Full control over the user experience
- No dependency on Intuit or Xero
- Differentiated product — the ledger becomes a moat
- Can design the data model for AI-first use from day one

**Disadvantages:**
- Significant engineering investment before anything is user-facing
- Accountant handoff is harder (accountant expects QuickBooks, not a proprietary system)
- Trust is harder to build — "where are my books?" is a harder question to answer
- Compliance responsibility increases — the product is now the system of record

**Best for:** Version 2.0, after product-market fit is established with the integration approach.

---

### 3.3 Option C: Replace the Ledger Entirely (Long-Term Vision)

The end state described in the project brief: a product that fully replaces QuickBooks, Xero, and the traditional bookkeeping workflow.

**What this requires:**
- A production-grade, multi-tenant double-entry ledger
- A full Chart of Accounts framework aligned with US GAAP standards
- Financial report generation: P&L, Balance Sheet, Cash Flow Statement
- Tax report output: Schedule C categories, 1099 contractor tracking, sales tax
- Accountant access tools: read-only view, journal entry adjustments, audit trail
- Bank reconciliation module
- Data migration from QuickBooks / Xero (import)
- Data export for accountants (OFX, CSV, PDF reports)

**The regulatory and compliance angle:**
This is not a compliance-regulated product category in the US (unlike banking or lending). There is no license required to provide bookkeeping software. However, providing incorrect financial records that lead to tax errors creates liability exposure — this should be clearly addressed in terms of service.

**The accountant relationship:**
Any product that replaces the ledger must also satisfy the accountant who uses the owner's books for tax filing. Accountants are conservative and prefer tools they know. The product will need an accountant-facing mode that produces reports in standard formats and allows the accountant to make year-end adjusting entries.

**Timeline:** This is 2–4 years out for a bootstrapped, solo-founder product. The integration approach (Option A) provides revenue and users while the ledger capability is built.

---

## Part 4: The Recommended Architecture Path

### Phase 1 — MVP (Month 0–12)

**Data capture:**
- Plaid for bank and credit card feeds
- Mobile camera + AI OCR for receipts
- Email forwarding for e-receipts and vendor invoices
- Manual entry for cash and personal-card-for-business transactions

**Ledger:**
- QuickBooks Online integration (primary)
- Xero integration (secondary)
- The product writes categorized, annotated transactions to the owner's existing ledger

**AI layer:**
- Transaction categorization using fine-tuned model on US SMB expense categories
- Receipt OCR and data extraction
- Plain-English summary generation (monthly P&L summary, cash position summary)
- Quarterly tax estimate calculation based on YTD profit from the ledger

**The user experience:**
- Mobile-first app for capture (receipt photo, quick manual entry, payment confirmation)
- Simple dashboard showing cash position, outstanding invoices, upcoming bills
- Weekly digest: "3 things to know about your money this week"
- Monthly summary: plain-English P&L narrative

---

### Phase 2 — Own Ledger (Month 12–24)

- Launch internal ledger for new users (existing users remain on QBO/Xero)
- Provide QuickBooks/Xero export for accountants
- Begin migrating active users who trust the product enough to switch

---

### Phase 3 — Replace (Month 24+)

- Full ledger with accountant portal
- Data migration from QuickBooks/Xero for all users
- Product becomes the system of record

---

## Part 5: Key Technical Decisions to Make Early

These decisions have long-term implications and should not be deferred:

**1. Which bank aggregator to start with**
Plaid vs MX. Plaid is faster to production. MX has better bank relationships in some areas. This choice affects your cost model and coverage from day one.

**2. How to handle the personal/business mixing problem**
The product needs a way to classify transactions as personal, business, or split — and store that classification. This classification layer is part of the ledger logic, not just the UI. Decide early whether this lives in the product's own database or inside QuickBooks/Xero.

**3. The Chart of Accounts approach**
QuickBooks and Xero each have their own Chart of Accounts structure. If the product maps to QuickBooks categories, Xero users get a different experience. A unified internal category taxonomy that maps to both is the right long-term approach.

**4. How the accountant gets their data**
At year-end, the accountant needs something they can work with. The simplest answer: the accountant logs into the owner's existing QuickBooks or Xero (because the product wrote everything there). More complex: the product generates an export in a standard format. Define this from day one because accountant trust is critical to adoption.

**5. AI model for categorization**
Fine-tuned model vs. general model with good prompting. For US SMB expense categorization, a well-prompted GPT-4o class model performs well out of the box. Fine-tuning on labeled SMB transactions improves edge cases but requires training data. Start with prompted general model; collect correction data to fine-tune later.

---

*Document prepared as research input for product and technical planning. Recommendations reflect a bootstrapped, solo-founder context with a mobile-first, AI-first product mandate. Assumptions: US market only, SMB owner as primary user, accountant as secondary stakeholder.*
