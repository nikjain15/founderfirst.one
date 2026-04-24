# Penny — AI Evaluation Criteria: Receipt & Invoice Data Capture
**Version 2 · April 2026**

> Part of the Penny AI Eval Suite — one of five evaluation documents.
> See `penny-architecture.md` → AI Architecture → Model Evaluation Before Deployment for the full picture.
>
> **Eval Suite:**
> - `penny-ai-evals.md` (Transaction Intelligence)
> - `penny-evals-conversational-qa.md` (Conversational & Financial Q&A)
> - `penny-evals-data-capture.md` ← you are here (Receipt & Invoice Capture)
> - `penny-evals-financial-computation.md` (Financial Computation Accuracy)
> - `penny-evals-anomaly-detection.md` (Anomaly & Pattern Detection)

---

## Scope

This document defines evaluation criteria for Penny's data capture pipeline — the AI that processes receipts, invoices, and other documents uploaded by Alex, and extracts structured data from them.

The failure mode here is different from transaction categorization: it is extraction accuracy. The AI must correctly read a real document — which may be blurry, rotated, partially cut off, or in an unusual format — and pull out the right fields with the right values. A wrong amount extracted from a receipt directly corrupts the ledger. This is not a "close enough" problem — financial extraction demands exact correctness.

---

## The Benchmark

**Industry state of the art for receipt/invoice OCR:**
The leading commercial OCR providers achieve 95–99% field-level accuracy on structured documents. Veryfi reports 98.7% accuracy. Mindee reports 96.1%. Google Cloud Vision achieves 94.3%. These benchmarks are measured on clean, well-lit, properly oriented documents — real-world mobile photos from a sole proprietor's pocket are significantly harder.

**The critical distinction: field-level vs. document-level accuracy.**
Field-level accuracy measures whether individual fields (vendor name, amount, date) are correct independently. Document-level accuracy measures whether all fields in a document are correct simultaneously. A receipt where the vendor and date are right but the amount is wrong is a document-level failure even if field-level accuracy is 67%. For financial purposes, document-level accuracy matters more — a partially correct receipt is still wrong if the amount is wrong.

**The real-world input distribution:**
Penny's receipt capture must work on actual mobile phone photos taken by small business owners in real conditions — thermal-faded paper, crumpled receipts pulled from a pocket, photos taken at angles in poor lighting, handwritten amounts, multilingual text (common in diverse US cities), and multi-page invoices. The eval test set must reflect this distribution, not clean scans.

---

## Maturity Tiers

| Tier | Trigger | What it means |
|---|---|---|
| **Launch** | Product goes live | Reliable extraction on clear to moderate quality inputs. Graceful failure on poor quality. |
| **Growth** | 500+ active users, 10,000+ processed receipts | Reliable extraction on most real-world inputs. Rarely needs Alex's help. |
| **Mastery** | 2,000+ active users, 100,000+ processed receipts | Better than any commercial OCR on sole proprietor documents. Nearly autonomous. |

---

## The Nine Evaluation Dimensions

### 1. Amount Extraction Accuracy

**What we're testing:** Does the AI extract the correct total amount from a receipt or invoice?

This is the single most critical field. A wrong amount directly corrupts the ledger. The standard is exact match — $47.23 is the only acceptable extraction of $47.23. $47.32 is a failure. $47.00 is a failure. There is no acceptable tolerance on dollar amounts.

**Test set:** Receipt and invoice images with known correct amounts. Must include:
- Clean printed receipts (the easy case)
- Thermal-faded receipts (common — thermal paper degrades within weeks)
- Handwritten amounts (common for local service businesses)
- Receipts with tip lines (restaurants — pre-tip vs. post-tip total)
- Receipts with tax lines (pre-tax vs. post-tax total)
- Receipts with multiple payment methods ("$20 cash, $27.23 card")
- Invoices with line items, subtotals, tax, and grand total
- Multi-currency receipts (rare but possible for US businesses near borders)
- Receipts with amounts in unusual positions or formats
- Receipts where the total is obscured, faded, or partially cut off

Minimum 300 receipt/invoice images at Launch, 1,000 at Growth, 3,000 at Mastery.

**Metrics:**
- Exact match accuracy (extracted amount = true amount, to the cent)
- Wrong extraction rate (AI extracts a specific amount that is incorrect — this is the dangerous case)
- Correct field identification: when a receipt has multiple amount fields (subtotal, tax, tip, total), does the AI identify and extract the correct one? (The total, not the subtotal.)

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Exact match accuracy (clean inputs) | ≥ 98% | ≥ 99% | ≥ 99.5% |
| Exact match accuracy (all inputs) | ≥ 93% | ≥ 97% | ≥ 99% |
| Wrong extraction rate | ≤ 2% | ≤ 0.5% | ≤ 0.1% |
| Correct field identification (tip/tax/total) | ≥ 95% | ≥ 98% | ≥ 99.5% |

**Hard blocker at all tiers:** The wrong extraction rate is a hard blocker. A model that confidently extracts a wrong amount is more dangerous than a model that fails to extract at all — because a wrong amount enters the ledger silently, while a failed extraction triggers a review card.

**Tip and tax policy:** The architecture must define which amount Penny extracts by default. For expenses, the post-tax total (what Alex actually paid) is the correct bookkeeping figure. For restaurant receipts with tips, the post-tip total is the correct figure. The eval tests against these policies.

---

### 2. Date Extraction Accuracy

**What we're testing:** Does the AI extract the correct transaction date from the receipt or invoice?

Dates on US receipts appear in many formats: MM/DD/YYYY, MM/DD/YY, Month DD YYYY, DD-Mon-YY, and more. The AI must parse all common US date formats correctly.

**Test set:** Receipts and invoices with known dates. Must include:
- Standard US date formats (MM/DD/YYYY, MM/DD/YY)
- Ambiguous dates where month and day could be swapped (e.g., 03/04/2026 — March 4 or April 3?)
- Dates with abbreviated month names ("Mar 4, 2026")
- Dates with full month names ("March 4, 2026")
- Receipts where the date is faded or partially obscured
- Invoices with multiple dates (invoice date, due date, payment date)
- Receipts near year boundaries (December/January)

Minimum 200 date extraction cases at Launch.

**Metrics:**
- Exact date match accuracy
- Ambiguous date handling: when a date is genuinely ambiguous (03/04/2026), does the AI flag it for confirmation rather than guessing?

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Exact date match (unambiguous dates) | ≥ 95% | ≥ 98% | ≥ 99.5% |
| Ambiguous date flagging | 100% | 100% | 100% |

**Hard blocker:** An ambiguous date must always be flagged for Alex's confirmation. A date silently assigned to the wrong month puts a transaction in the wrong period and corrupts the monthly P&L.

---

### 3. Vendor Name Extraction Accuracy

**What we're testing:** Does the AI correctly extract the vendor or business name from the receipt or invoice?

**Test set:** Receipts and invoices with known vendor names. Must include:
- Clear printed business names
- Names mixed with addresses, phone numbers, or taglines
- Names in unusual fonts, logos, or stylized text
- Handwritten vendor names (common on manual invoices)
- Names in languages other than English (common in diverse US cities — Chinese restaurants, Korean grocers, etc.)

Minimum 200 vendor extraction cases at Launch.

**Metrics:**
- Exact match accuracy (extracted name matches expected canonical name)
- Fuzzy match accuracy (extracted name is recognizably correct)

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Exact match | ≥ 85% | ≥ 92% | ≥ 97% |
| Fuzzy match | ≥ 93% | ≥ 97% | ≥ 99% |

---

### 4. Receipt-to-Transaction Matching

**What we're testing:** When Alex uploads a receipt, can the system correctly match it to an existing transaction from the bank feed?

This is the most valuable capability of receipt capture — Alex photographs a receipt, and Penny matches it to the corresponding bank charge automatically. The match is based on amount, vendor, and date proximity.

**Test set:** Receipt images paired with a synthetic bank feed containing the matching transaction and several similar-but-different transactions (distractors). Must include:
- Exact amount match, same vendor, same date (easy case)
- Amount match with slight timing difference (charged today, receipt dated yesterday)
- Multiple transactions from the same vendor on the same day (which one is this receipt for?)
- Receipt amount that differs from bank amount due to tip, cash back, or partial payment
- Receipts that have no matching bank transaction (paid in cash — no match should be attempted)

Minimum 150 matching cases at Launch, 500 at Growth.

**Metrics:**
- Match accuracy: when a matching transaction exists, is the correct one identified?
- False match rate: when no matching transaction exists (cash payment), does the system correctly identify this as unmatched?
- Duplicate receipt detection: when Alex uploads the same receipt twice (or photographs it from a different angle), is the duplicate detected?

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Match accuracy | ≥ 90% | ≥ 95% | ≥ 98% |
| False match rate | ≤ 3% | ≤ 1% | ≤ 0.5% |
| Duplicate receipt detection | ≥ 85% | ≥ 93% | ≥ 97% |

---

### 5. Invoice Field Extraction

**What we're testing:** When Alex uploads a client invoice (sent or received), does the AI correctly extract the full set of invoice fields?

Invoices are more structured than receipts and contain more fields. The extraction must capture: vendor/client name, invoice number, line items, subtotal, tax, total, due date, and payment terms if present.

**Test set:** Invoice images and PDFs with known correct field values. Must include:
- Standard single-page invoices from common invoicing tools (FreshBooks, Wave, QuickBooks)
- Multi-page invoices where the total is on page 2 and vendor details on page 1
- Handwritten or semi-structured invoices (common from contractors and suppliers)
- Invoices with multiple line items requiring per-item extraction
- Invoices in non-standard layouts (not all invoices look like templates)

Minimum 100 invoice cases at Launch, 300 at Growth.

**Metrics:**
- Per-field extraction accuracy: vendor name, invoice number, total amount, due date — each measured independently
- Line item extraction accuracy: for invoices with multiple items, what percentage of line items are correctly extracted?
- Complete document accuracy: percentage of invoices where all critical fields (vendor, total, due date) are extracted correctly

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Total amount accuracy | ≥ 96% | ≥ 99% | ≥ 99.5% |
| Vendor name accuracy | ≥ 90% | ≥ 95% | ≥ 98% |
| Due date accuracy | ≥ 90% | ≥ 96% | ≥ 99% |
| Invoice number accuracy | ≥ 85% | ≥ 93% | ≥ 97% |
| Line item accuracy | ≥ 80% | ≥ 90% | ≥ 96% |
| Complete document accuracy | ≥ 80% | ≥ 92% | ≥ 97% |

---

### 6. Document Quality Handling — Graceful Failure

**What we're testing:** When a receipt or invoice is too poor quality to extract reliably, does the AI fail gracefully — clearly telling Alex it cannot read the document — rather than extracting wrong data?

This is the safety valve. A confident wrong extraction is more dangerous than an honest "I can't read this." The model must know when it does not know.

**Test set:** A curated set of deliberately poor-quality inputs:
- Very low resolution photos (under 640px width)
- Photos taken in extreme low light
- Photos where the receipt is severely crumpled or torn
- Photos where the receipt is partially out of frame (amount cut off)
- Photos taken at extreme angles (> 45 degrees)
- Blank or near-blank images (camera fired accidentally)
- Non-receipt images (Alex accidentally uploaded a photo of her cat)
- Receipts that are so faded they are genuinely unreadable

Minimum 50 poor-quality cases at Launch, 150 at Growth.

**Metrics:**
- Graceful failure rate: when the input is genuinely unreadable, does the AI say so clearly rather than attempting extraction?
- False confidence on bad input: does the AI ever produce a high-confidence extraction from a poor-quality input that is actually wrong? (This is the dangerous failure — a wrong number extracted with confidence from a blurry receipt.)
- User communication quality: when the AI cannot read the document, does Penny communicate this clearly and helpfully? ("I couldn't quite read this one — can you take another photo with better lighting?")

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Graceful failure rate (unreadable inputs) | ≥ 90% | ≥ 95% | ≥ 99% |
| False confidence on bad input | ≤ 3% | ≤ 1% | ≤ 0.1% |

**Hard blocker at all tiers:** False confidence on bad input is a hard blocker. A model that confidently extracts "$47.23" from a receipt photo that is actually unreadable is introducing fabricated data into the ledger.

---

### 7. Multi-Item Receipt Handling

**What we're testing:** When a single receipt contains multiple line items that may need to be split across categories (e.g., a supply store receipt with both office supplies and cleaning products), how does the AI handle extraction and flagging?

**Test set:** Receipts with multiple line items where the items span different expense categories. Must include:
- Office supply store receipts with mixed items (paper vs. printer vs. personal items)
- Restaurant supply receipts for a local service business
- Online order confirmations with multiple product categories
- Receipts where some items are business and some are personal

Minimum 50 multi-item cases at Launch, 150 at Growth.

**Metrics:**
- Line item extraction accuracy: percentage of individual line items correctly extracted
- Split flagging rate: when items in a receipt span multiple categories, does the AI flag it for category review rather than assigning the entire receipt to one category?

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Line item extraction accuracy | ≥ 80% | ≥ 90% | ≥ 96% |
| Split flagging rate | ≥ 85% | ≥ 93% | ≥ 98% |

---

### 8. Extraction Confidence Scoring

**What we're testing:** Does the model accurately know when it is uncertain about an extracted field?

Just like transaction categorization, extraction confidence must be calibrated. When the model says it is 95% confident about an extracted amount, it should be right approximately 95% of the time. Miscalibrated extraction confidence leads to wrong amounts entering the ledger silently (overconfident) or unnecessary review cards for clear receipts (underconfident).

**Test set:** Same images as the other dimensions, with confidence scores recorded for each extracted field.

**Metrics:**
- Expected Calibration Error (ECE) for extraction confidence, measured per field type (amount, date, vendor)
- High-confidence accuracy: when extraction confidence is above the auto-accept threshold, how often is the extraction actually correct?

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| ECE (amount extraction) | ≤ 0.07 | ≤ 0.04 | ≤ 0.02 |
| ECE (date extraction) | ≤ 0.08 | ≤ 0.05 | ≤ 0.03 |
| High-confidence accuracy (amount) | ≥ 97% | ≥ 99% | ≥ 99.5% |

---

### 9. Processing Latency

**What we're testing:** How quickly does the capture pipeline process an uploaded receipt or invoice?

Alex takes a photo and expects a response. The architecture does not define a specific target for receipt processing (the <5 second target is for transaction enrichment), so we define it here: receipt extraction should complete within a timeframe that feels responsive on mobile.

**Metrics:**
- P50 latency (median) — from image upload to extraction result
- P95 latency

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| P50 latency | < 5 seconds | < 3 seconds | < 2 seconds |
| P95 latency | < 10 seconds | < 7 seconds | < 5 seconds |

---

## Test Set Requirements — Image Library

The receipt/invoice eval requires a curated image library that represents the real-world input distribution. This is fundamentally different from a text-based test set — it requires actual photographs.

**Image sourcing strategy:**
- **Concierge phase:** Every receipt photo uploaded by concierge users, with the correct extraction verified by the founder. These are the highest-value test images because they represent real user behavior.
- **Controlled capture:** Photographs of real receipts taken in controlled conditions at various quality levels (good lighting, poor lighting, crumpled, faded, angled). These fill gaps in the concierge set.
- **Synthetic generation:** For edge cases that rarely occur naturally (extremely faded, multilingual, handwritten), synthetic or augmented images can supplement. Clearly labeled as synthetic. Never more than 20% of the test set.

**Distribution requirements:**
- At least 40% of images are mobile phone photos (not scans or screenshots)
- At least 15% are poor quality (blurry, dark, angled, faded)
- At least 10% are handwritten or semi-structured
- Coverage across common receipt types: restaurants, office supplies, online orders, subscriptions, professional services, utilities

---

## Pass / Fail Summary — Launch Tier

| Dimension | Key Threshold | Hard Blocker? |
|---|---|---|
| Amount exact match (clean inputs) | ≥ 98% | Yes |
| Amount exact match (all inputs) | ≥ 93% | Yes |
| Wrong extraction rate (amount) | ≤ 2% | Yes |
| Tip/tax/total field identification | ≥ 95% | Yes |
| Date exact match (unambiguous) | ≥ 95% | Yes |
| Ambiguous date flagging | 100% | Yes |
| Vendor name fuzzy match | ≥ 93% | Yes |
| Receipt-to-transaction match accuracy | ≥ 90% | Yes |
| False match rate | ≤ 3% | Yes |
| Invoice total amount accuracy | ≥ 96% | Yes |
| Graceful failure on unreadable inputs | ≥ 90% | Yes |
| False confidence on bad input | ≤ 3% | Yes |
| Multi-item split flagging | ≥ 85% | Yes |
| Amount extraction ECE | ≤ 0.07 | Yes |
| High-confidence amount accuracy | ≥ 97% | Yes |
| Processing latency (P95) | < 10 seconds | Yes |

Every row is a hard blocker. There is no weighting, no averaging, no exceptions.

---

*Penny · AI Evaluation Criteria: Receipt & Invoice Data Capture · v2 · April 2026*
*Benchmarked against: Veryfi (98.7% field-level), Mindee (96.1%), Google Cloud Vision (94.3%).*
*Maintained alongside the codebase. Every production error is a new test case.*
