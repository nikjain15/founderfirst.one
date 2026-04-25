/**
 * constants/copy.js — Central registry for every static Penny utterance,
 * fallback, empty-state line, toast, and user-visible error in the demo.
 *
 * Shipped as SCAF-3 of the bedrock refactor (25 April 2026). Sibling to
 * constants/variants.js, which holds concept-level enums.
 *
 * Six frozen top-level groups:
 *
 *   ONBOARDING_COPY     — the 8 locked headline/why pairs + welcome / pulling
 *                         fallbacks. Sourced from screens/onboarding.jsx
 *                         FALLBACK_COPY (lines 60–69 pre-extraction). Every
 *                         entry below the 8-row table is a tone-aligned
 *                         defensive default for the same screen.
 *   THREAD_INTRO_COPY   — first-time intro (name + business), header status,
 *                         placeholders, and Penny-thread fallbacks for
 *                         greeting / idle. Sourced from screens/thread.jsx.
 *   CARD_FALLBACK_COPY  — every branch of fallbackMsg() in screens/card.jsx
 *                         plus default CTAs, vendor fallbacks, confidence-bar
 *                         labels, and the category-sheet title. Mirrors the
 *                         variants in constants/variants.js → CARD_VARIANTS.
 *   EMPTY_STATE_COPY    — strings shown when a list / data set is empty.
 *                         Voice rule: shame-free re-entry — never imply the
 *                         user is behind. ✓ in "All caught up ✓" is the
 *                         Unicode character U+2713, not an emoji.
 *   TOAST_COPY          — every toast across founder + CPA screens. Plain
 *                         strings for fixed copy; functions for
 *                         interpolation (vendor / category / count / etc.).
 *                         Grouped by source screen in inline comments.
 *   ERROR_COPY          — recovery-oriented Penny-voice errors plus the five
 *                         CPA AuthGate form-validation strings. The form
 *                         strings were rewritten in Penny voice on
 *                         25 Apr 2026 (CEO-approved follow-up).
 *
 * Rules:
 *   - Never hand-write a static Penny utterance in a screen file. Import.
 *   - AI-generated copy still flows through worker-client.js → renderPenny;
 *     this registry only owns STATIC fallbacks and acknowledgments.
 *   - Onboarding strings are LOCKED — see CLAUDE.md "Approved onboarding
 *     copy" table. Do not change without CEO sign-off.
 *   - Function entries are pure formatters: they take runtime values and
 *     return a string or message object. The function reference is frozen;
 *     the body is inert.
 *   - Related prompt files live under public/prompts/. AI prompts edit
 *     there; static fallbacks edit here.
 *
 * Out of scope for this commit (deferred to follow-ups):
 *   - Sheet titles, eyebrow labels, screen titles (UI structural chrome).
 *   - Action-state button labels ("Sending…", "Connecting…") — tightly
 *     coupled to local component state.
 *   - Penny-tonal narrative helper text (e.g. "Things Penny has learned.",
 *     "Penny watches your inbox for receipts and invoices."). These are
 *     real Penny copy but were not enumerated in the SCAF-3 proposal —
 *     a follow-up commit may extract them.
 */

// ── Onboarding (LOCKED — per CLAUDE.md "Approved onboarding copy" table) ─────

export const ONBOARDING_COPY = Object.freeze({
  welcome: Object.freeze({
    greeting: "👋 Hi, I'm Penny.",
    headline: "Nice to meet you. The books are on me from here.",
    why:      "One quick setup and I take it from here — for good.",
  }),
  entity: Object.freeze({
    headline: "Let me make sure I understand your setup first.",
    why:      "Get this right once and I'll handle everything the right way — every time.",
  }),
  "entity-diag": Object.freeze({
    headline: "No worries at all — let's work it out together.",
    why:      "Two questions and I'll know exactly what to do.",
  }),
  industry: Object.freeze({
    headline: "What kind of work do you do?",
    why:      "I want to know your business the way you know it.",
  }),
  payments: Object.freeze({
    headline: "How do your clients pay you?",
    why:      "Every payment you earn — I'll be watching for it.",
  }),
  expenses: Object.freeze({
    headline: "What do you usually spend on?",
    why:      "Tell me once. I'll recognize it every time after that.",
  }),
  checkin: Object.freeze({
    headline: "When's a good time for me to check in?",
    why:      "I'll have everything ready — you just show up.",
  }),
  bank: Object.freeze({
    headline: "Which account should I start watching?",
    why:      "I read every transaction as it comes in. Your money never moves.",
  }),

  // Defensive fallbacks inside WelcomeSpeech (screens/onboarding.jsx lines
  // 450–452) — used when the message object is briefly null. Tone-aligned
  // with the welcome row above.
  welcomeFallbackGreeting: "👋 Hi, I'm Penny.",
  welcomeFallbackWhy:      "Takes about 60 seconds to get started.",

  // Pulling step (screens/onboarding.jsx line 181 + PullingBody line 498).
  // Static — no AI call during pulling.
  pulling: Object.freeze({
    headline: "Pulling the last 30 days…",
    why:      "Reading transactions. Nothing is being moved.",
  }),
  pullingHint: "I'll show you the first few in a moment.",
});

// ── Thread intro + thread bubble fallbacks ───────────────────────────────────
// Sources: screens/thread.jsx. The first-time intro flow (name → business)
// is a conversational onboarding pattern documented in CLAUDE.md "Thread
// screen" §. Greeting / idle fallbacks are shown when ai.renderPenny errors
// or hasn't returned yet.

export const THREAD_INTRO_COPY = Object.freeze({
  // Step 1 — Penny asks for the user's name.
  nameQuestion: Object.freeze({
    headline: "What's your name?",
    why:      "So Penny can speak to you directly.",
  }),

  // Step 2 — Penny acknowledges name and asks for business name. `name` is
  // the just-entered first name, interpolated verbatim.
  businessQuestion: (name) => ({
    headline: `Nice to meet you, ${name}! What's your business called?`,
    why:      "So Penny speaks to you, not just anyone.",
  }),

  // Ask-bar placeholders during intro flow + after intro completes.
  namePlaceholder:     "Your first name…",
  businessPlaceholder: "Your business name…",
  askPlaceholder:      "Ask Penny anything…",

  // Greeting fallback used when ai.renderPenny errors. `firstName` may be
  // empty string — the conditional shape preserves the original render.
  greetingFallback: (firstName) => ({
    headline: `Hi${firstName ? `, ${firstName}` : ""}. Here's what I'm seeing.`,
    why:      "I pulled in the last 30 days.",
    tone:     "fyi",
  }),

  // Shown when the card queue is exhausted and ai.renderPenny errors.
  idleFallback: Object.freeze({
    headline: "That's it for now. I'll keep watching.",
    tone:     "fyi",
  }),

  // Header subtext under the Penny p-mark.
  headerStatus: "online · watching your accounts",

  // Confirmed-slug vendor fallback when card.vendor is null.
  confirmedSlugFallbackVendor: "Transaction",
});

// ── Approval card fallbacks (mirrors CARD_VARIANTS in constants/variants.js) ─
// Sources: screens/card.jsx fallbackMsg() + inline literals (default CTAs,
// vendor fallbacks, confidence-bar labels, category sheet title, CPA-
// suggestion variant labels). All entries here are static defaults — the
// live AI copy still comes from card.approval via worker-client.js.

export const CARD_FALLBACK_COPY = Object.freeze({
  // Four fallbackMsg() branches. `amountFmt` is the already-formatted
  // currency string from fmt(). `categoryGuess` may be null/undefined.
  income:        (vendor, amountFmt) => ({
    headline: "You just got paid 🎉",
    why:      `${vendor} — ${amountFmt}.`,
    tone:     "celebration",
  }),
  ownersDraw:    (amountFmt) => ({
    headline: `${amountFmt} moved to your personal account.`,
    why:      "That's an owner's draw — it won't count as an expense.",
    tone:     "fyi",
  }),
  lowConfidence: (amountFmt) => ({
    headline:     `Caught a charge I don't recognize — ${amountFmt}.`,
    why:          "Can you help me file this one?",
    ctaPrimary:   "Yes, business",
    ctaSecondary: "Personal",
    tone:         "action",
  }),
  expenseDefault: (vendor, amountFmt, categoryGuess) => ({
    headline:     `${vendor} — ${amountFmt}.`,
    why:          `Looks like ${categoryGuess || "an expense"}.`,
    ctaPrimary:   "Confirm",
    ctaSecondary: "Change",
    tone:         "fyi",
  }),

  // CTA defaults when pennyMsg returns no ctaPrimary/ctaSecondary.
  defaultPrimaryCta:   "Confirm",
  defaultSecondaryCta: "Change",

  // Variant-specific button labels.
  ruleProposalCta:      "Yes, auto-categorize",
  skipForNowCta:        "Skip for now",
  cpaSuggestionApprove: "Approve",
  cpaSuggestionKeep:    "Keep as is",

  // CPA-suggestion variant labels (eyebrow + vendor fallbacks).
  cpaReclassEyebrow:           "Reclassification",
  cpaSuggestionVendorFallback: "Reclassification suggestion",
  cpaSuggestionGenericVendor:  "Reclassification",
  cpaNoteAuthorFallback:       "CPA",

  // Vendor fallbacks for non-CPA variants.
  ownersDrawVendorFallback: "Owner's draw",
  vendorFallback:           "Transaction",

  // Bottom sheet that lets the user change the category.
  categorySheetTitle: "Change category",

  // ConfidenceBar labels — shown when card.confidence is set.
  confidenceHigh:   "High confidence",
  confidenceMedium: "Medium confidence",
  confidenceLow:    "I'm not sure",
});

// ── Empty states ─────────────────────────────────────────────────────────────
// Voice rule: never imply the user is behind. "All caught up ✓" uses ✓
// (U+2713), not an emoji. Sources: screens/books.jsx, screens/add.jsx,
// screens/avatar-menu.jsx, screens/cpa/LearnedRules.jsx, screens/cpa/Chat.jsx.

export const EMPTY_STATE_COPY = Object.freeze({
  // books.jsx — Needs a look section is empty.
  needsALookEmpty: "All caught up ✓",

  // books.jsx — drill-down sheets when the corresponding scenario data is
  // missing. Generic + a couple of specialised variants.
  noData:         "No data available.",
  noExpenseData:  "No expense data available.",
  noTransactions: "No transactions found.",

  // add.jsx — provider search returns no matches.
  noProvidersMatched: "No providers matched.",

  // avatar-menu.jsx — Memory list / archived-work sheet.
  memoryEmpty:     "Nothing here yet.",
  noArchivedWork:  "No archived work to show.",

  // cpa/LearnedRules.jsx — no rules approved yet.
  cpaLearnedRulesEmpty: "No rules yet. Corrections you approve will appear here.",

  // cpa/Chat.jsx — chat history is empty.
  cpaChatEmptyHint: "Ask about specific transactions, IRS lines, totals, or anything in these books.",
});

// ── Toasts ───────────────────────────────────────────────────────────────────
// Every confirmation/acknowledgment toast across founder + CPA screens.
// Plain string for fixed copy; arrow function for interpolated values.
// Grouped by source screen.

export const TOAST_COPY = Object.freeze({
  // ── card.jsx ────────────────────────────────────────────────────────────
  confirmed:             "Got it ✓",
  changedTo:             (category) => `Changed to ${category}`,
  savedForLater:         "Saved for later. I'll bring it back.",
  ruleCreated:           (vendor, category) => `Auto-categorizing ${vendor} as ${category} going forward ✓`,
  cpaSuggestionApproved: "Category updated ✓",
  cpaSuggestionKeptAsIs: "Kept as is.",

  // ── books.jsx ───────────────────────────────────────────────────────────
  detailLoading:    "Detail data still loading.",
  inviteCreated:    "Invite link created.",
  inviteRevoked:    "Invite revoked.",
  booksSentToCpa:   (cpaName) => `Books sent to ${cpaName} ✓`,
  staleAddRedirect: (cpaName) => `Tap "Invite to live books" to manage ${cpaName}'s additions.`,

  // ── add.jsx ─────────────────────────────────────────────────────────────
  capturedLogged:         "Logged. I'll add it to your books.",
  parseFailed:            "Couldn't parse that. Try again in a moment.",
  alreadyConnected:       (providerName) => `${providerName} is already connected.`,
  providerConnected:      (providerName) => `${providerName} connected.`,
  accountDisconnected:    "Account disconnected.",
  emailConnectedWatching: (providerName) => `${providerName} connected — watching for receipts.`,
  importComplete:         (count) => `${count} transactions imported. Check your Penny thread.`,

  // ── avatar-menu.jsx ─────────────────────────────────────────────────────
  // (inviteCreated / inviteRevoked are reused from books.jsx group above.)
  cpaAccessRemoved:  "CPA access removed.",
  memoryForgotten:   "Forgotten.",
  entityTypeUpdated: "Entity type updated.",

  // ── invoice.jsx ─────────────────────────────────────────────────────────
  invoiceSent:        (email) => `Invoice sent to ${email}.`,
  recurringScheduled: (freqLowercase) => `Recurring ${freqLowercase} invoice scheduled ✓`,
  draftSaved:         "Draft saved.",

  // ── cpa/Books.jsx ───────────────────────────────────────────────────────
  cpaTxnAdded:         "Transaction added — pending founder acknowledgment.",
  cpaTxnFlagged:       "Transaction flagged.",
  cpaNoteSaved:        "Note saved.",
  cpaSuggestionSent:   "Suggestion sent to founder for approval.",
  cpaPdfComingSoon:    "PDF export coming soon.",
  cpaCsvDownloaded:    "CSV downloaded.",
  cpaComingInStep8:    "Coming in Step 8.",

  // ── cpa/Chat.jsx ────────────────────────────────────────────────────────
  cpaPennyUnavailable: "Penny is unavailable right now.",

  // ── cpa/CashFlow.jsx + cpa/ProfitLoss.jsx ───────────────────────────────
  cpaExportReadyDemo: "Export ready — demo only.",
});

// ── Errors ───────────────────────────────────────────────────────────────────
// Recovery-oriented Penny-voice errors + CPA AuthGate form-validation strings.

export const ERROR_COPY = Object.freeze({
  // thread.jsx — thread.qa AI failure path.
  threadQaError: Object.freeze({
    headline: "I couldn't get that right now.",
    why:      "Try again in a moment.",
    tone:     "fyi",
  }),

  // books.jsx — books.qa AI failure path.
  booksQaError: Object.freeze({
    headline: "I don't have that detail handy right now.",
    why:      "Try again in a moment.",
  }),

  // cpa/Chat.jsx — Penny response-shape fallback when no data is available.
  cpaPennyNoData:   "I don't have enough data to answer that right now.",

  // cpa/Chat.jsx — loading bubble label.
  cpaChatThinking:  "Thinking…",

  // cpa/AuthGate.jsx — form validation, rewritten in Penny voice (25 Apr 2026).
  fieldRequiredName:  "I'll need your full name to set this up.",
  fieldInvalidEmail:  "That email doesn't look right — mind checking it?",
  fieldPasswordMin:   "Let's make that password at least 8 characters.",
  fieldLicenseFormat: "License numbers run 6–12 letters and numbers — could you check yours?",
  fieldStateCode:     "I need a 2-letter state code (like NY or CA).",
});
