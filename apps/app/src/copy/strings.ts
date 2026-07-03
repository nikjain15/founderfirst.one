/**
 * The apps/app strings catalog — the SINGLE source of every owner/CPA-facing
 * word the app renders (Roadmap principle #3, card CENTRAL-1). No component may
 * hold a user-facing string literal; each one lives here so the whole product's
 * language can be tuned in ONE place, on brand (VOICE.md), without hunting
 * through JSX. A CI grep gate (scripts/check-app-strings.ts) fails the build if a
 * new literal appears in a component.
 *
 * Shape: a namespaced tree. Leaves are either strings, or functions when the copy
 * interpolates a value (count, money, name) — keep the interpolation here so
 * pluralization and phrasing stay with the words, not scattered in components.
 *
 * Brand strings (URL, email, company/product name) do NOT live here — they come
 * from `@ff/site` (SITE), the cross-app source of truth. Import SITE where needed.
 *
 * VOICE.md governs the words: no exclamation marks, no jargon in owner-facing
 * copy, lead with the human moment, quote offers verbatim.
 */

export const COPY = {
  // ── Global / shell ─────────────────────────────────────────────────────────
  common: {
    loading: "Loading…",
    loadingWorkspaces: "Loading your workspaces…",
    loadingBooks: "Loading the books…",
    tryAgain: "Try again",
    reload: "Reload",
    cancel: "Cancel",
    back: "← Back",
    saving: "Saving…",
    selectAccount: "Select account…",
    accountAria: "Account",
    none: "None",
    emDash: "—",
  },

  // ── Auth (login / invite accept) ───────────────────────────────────────────
  auth: {
    signIn: "Sign in",
    signInLead: "Penny's keeping your books — sign in to pick up where you left off. We'll email you a one-time link.",
    emailAria: "Email address",
    emailPlaceholder: "you@company.com",
    emailMeLink: "Email me a link",
    sending: "Sending…",
    notConfigured: "Sign-in isn't configured in this environment.",
    checkEmail: (email: string) => ({ before: "Check ", email, after: " for a sign-in link." }),
    accepting: "Accepting your invite…",
    inviteMissingToken: "This invite link is missing its token.",
    inviteFailed: (email: string) =>
      `We couldn't accept this invite — it may be expired or already used. Still stuck? Email ${email} and we'll sort it out.`,
    inviteAccepted: "Invite accepted — taking you in…",
  },

  // ── Home / workspaces ──────────────────────────────────────────────────────
  home: {
    welcome: "Welcome.",
    welcomeLead: "Create your first organization and Penny will start keeping your books.",
    loadError: (email: string) =>
      `We couldn't load your workspaces just now — please refresh. If it keeps happening, email ${email}.`,
    noMembership:
      "You're not currently on this organization's books — you may have left it, or an invite was revoked. Switch to one of yours above, or ask the owner to re-invite you.",
  },

  // ── Top bar / menus ────────────────────────────────────────────────────────
  nav: {
    penny: "Penny",
    brandTitle: (company: string) => `Penny by ${company}`,
    roleOwner: "Owner",
    roleCpa: "CPA",
    roleCpaReadonly: "CPA · read-only",
    settings: "Settings",
    staffConsole: "Staff console",
    signOut: "Sign out",
    accountMenuAria: "Account menu",
    switchOrgAria: "Switch organization",
    selectOrg: "Select organization",
    newOrg: "+ New organization",
    orgsAria: "Organizations",
  },

  // ── Org create ─────────────────────────────────────────────────────────────
  org: {
    typeAria: "Organization type",
    business: "Business",
    cpaPractice: "CPA practice",
    createBusiness: "Create business",
    createPractice: "Create practice",
    creating: "Creating…",
    practiceNameAria: "Practice name",
    businessNameAria: "Business name",
    practiceNamePlaceholder: "Your practice name",
    businessNamePlaceholder: "Your business name",
    errLimit: "You've reached the limit on organizations. Contact us if you need more.",
    errBadName: "Please enter a name (up to 120 characters).",
    errBadType: "Please choose a business or a CPA practice.",
    errCreate: "Could not create organization.",
  },

  // ── Invite CPA ─────────────────────────────────────────────────────────────
  invite: {
    heading: "Invite your accountant",
    emailAria: "Accountant email",
    emailPlaceholder: "cpa@firm.com",
    accessAria: "Access level",
    fullAccess: "Full access",
    readOnly: "Read-only",
    creating: "Creating invite…",
    submit: "Invite CPA",
    errSend: "Could not send invite.",
    linkLabel: "Invite link (send to your accountant):",
  },

  // ── Approval setting ───────────────────────────────────────────────────────
  approval: {
    heading: "Review accountant's entries",
    checkboxAria: "Require my approval before my accountant's entries hit the books",
    label: "Hold my accountant's entries for my approval before they appear in reports.",
    errUpdate: "Could not update setting.",
  },

  // ── Settings page ──────────────────────────────────────────────────────────
  settings: {
    eyebrow: "Settings",
  },

  // ── Error boundary ─────────────────────────────────────────────────────────
  errors: {
    somethingWrong: "Something went wrong.",
    viewFailed:
      "This view failed to load — usually because a new version shipped while this tab was open. Reloading fixes it.",
    verifyAccessFailed: "Couldn't verify access.",
    verifyAccessBody: "We couldn't check your staff access just now.",
  },

  // ── Ledger workspace (owner + CPA) ─────────────────────────────────────────
  ledger: {
    eyebrowOwner: "Your books",
    eyebrowClient: "Client books",
    readonlyChip: "Read-only — posting disabled",
    sectionsAria: "Sections",
    subSectionsAria: (label: string) => `${label} sections`,
    loadError: "Couldn't load the books. Try again.",
  },

  // ── Overview / Home tab ────────────────────────────────────────────────────
  overview: {
    setupTitle: "Let's set up your books",
    setupBody:
      "Connect your bank or import a statement and Penny starts categorizing right away. Prefer to do it by hand? You can add accounts and post entries too.",
    goToConnections: "Go to Connections",
    kpiCashAssets: "Cash & assets",
    kpiNetIncome: "Net income (all time)",
    kpiNeedsReview: "Needs review",
    latestActivity: "Latest activity",
    noEntries: "No entries yet.",
    notBalancedBanner: (amount: string) =>
      `Something doesn't add up in your books — the totals are off by ${amount}. This is almost always a data hiccup, not lost money. Penny flagged it so you (or your accountant) can take a look.`,
    inviteNudge:
      "Work with an accountant? Invite them to your books — you control full or read-only access.",
    inviteNudgeAction: "Invite accountant",
    dismissAria: "Dismiss",
    // Takeaway lines (the one so-what line at the top).
    takeawayNotBalanced:
      "Something doesn't add up in your books — Penny spotted it. This is almost always a data fix, not lost money.",
    takeawayOpenJournal: "Open journal",
    takeawayPending: (n: number) => ({
      count: n,
      rest: ` ${n === 1 ? "entry is" : "entries are"} waiting for your approval.`,
    }),
    takeawayReview: "Review",
    takeawayUncat: (n: number) => ({
      before: "Penny has ",
      count: n,
      after: ` ${n === 1 ? "transaction" : "transactions"} ready to categorize.`,
    }),
    takeawayCategorize: "Categorize",
    takeawayNoActivity:
      "No activity yet — import your history or post your first entry to get started.",
    takeawayNegative: (money: string) => ({
      before: "You're spending more than you're earning — net ",
      money,
      after: " so far.",
    }),
    takeawayHealthy: (money: string) => ({
      before: "Net income ",
      money,
      after: " — your books look healthy. Nothing needs you right now.",
    }),
  },

  // ── Connections tab ────────────────────────────────────────────────────────
  connections: {
    bringInData: "Bring in your data",
    importDisabled: "You have read-only access — importing is disabled.",
    shareWithAccountant: "Share with your accountant",
    inviteLead: "Invite your accountant to your books — you control full or read-only access.",
    accountantManagedByOwner: "Your accountant relationship is managed by the business owner.",
  },

  // ── Catch-up mode (W2.1) — the shame-free "get me caught up" guided flow. Years
  //    behind is normal; the copy meets the owner where they are, never scolds a
  //    gap (VOICE.md bans shame language), measures effort in minutes per year, and
  //    quotes the flat-per-year price verbatim. ──────────────────────────────────
  catchUp: {
    entryTitle: "Catch me up",
    entrySub: "Behind on your books? Drop in what you have and Penny gets each year sorted — you just confirm the handful she's unsure about.",
    startCta: "Get me caught up",
    // Step 1 — drop files
    dropTitle: "Drop in your files",
    dropLead: "Add a bank export for each year you're catching up on. One file or many — Penny sorts them by year.",
    dropChoose: "Choose CSV files",
    dropReadError: "We couldn't read that file. Check it's a CSV export and try again.",
    filesQueued: (n: number) => `${n} ${n === 1 ? "file" : "files"} ready`,
    removeFileAria: (name: string) => `Remove ${name}`,
    // Column mapping (shared across files with the same shape)
    mapTitle: "Which columns are which?",
    mapLead: "Tell Penny where the date, description, and amount live. She'll use the same map for every file.",
    bankAccount: "Which account is this?",
    defaultCategory: "Where unsure amounts land for now",
    defaultCategoryAria: "Default category for uncategorized amounts",
    next: "Next",
    // Step 2 — bring it in
    bringInTitle: "Bring it all in",
    bringInLead: (rows: number, years: number) =>
      `${rows} ${rows === 1 ? "transaction" : "transactions"} across ${years} ${years === 1 ? "year" : "years"}, ready to sort.`,
    bringInCta: "Bring it in",
    bringingIn: "Bringing it in…",
    bringInError: "Something interrupted the import. Nothing was half-saved — you can start it again.",
    // Step 3 — Penny sorts
    sortingTitle: "Penny's sorting your books",
    sortingLead: "She's grouping transactions and matching the ones she recognizes. This can take a moment for a few years of history.",
    sortedTitle: (n: number) => `Penny sorted ${n} ${n === 1 ? "transaction" : "transactions"}`,
    // Batch approve
    batchTitle: "Confirm in one go",
    batchLead: (n: number) =>
      `Penny's confident about ${n} ${n === 1 ? "transaction" : "transactions"}. Confirm them all at once, or open any to change it.`,
    batchApproveCta: (n: number) => `Confirm ${n} at once`,
    batchApproving: "Confirming…",
    batchDone: (n: number) => `Confirmed ${n} ✓`,
    batchNoneConfident: "Penny isn't sure enough to bulk-confirm any of these — she'll ask you about them below.",
    // Batched questions (the interruption budget)
    questionsTitle: "A few Penny wants to check",
    questionsLead: (n: number) =>
      `${n} ${n === 1 ? "transaction needs" : "transactions need"} your call. That's the whole ask for this batch — not one prompt per transaction.`,
    questionsNone: "Nothing left for you to decide — Penny handled the rest.",
    // Per-year progress meter
    progressTitle: "Your years",
    progressLoadError: "Couldn't load your catch-up progress. Try again.",
    yearDone: (year: number) => `${year} ✓`,
    yearInProgress: (year: number) => `${year} in progress`,
    yearNotStarted: (year: number) => `${year} not started`,
    yearDetail: (uncat: number, recon: number) =>
      `${uncat} to sort · ${recon} ${recon === 1 ? "month" : "months"} reconciled`,
    yearReconcileCta: (year: number) => `Reconcile ${year}`,
    yearExportCta: (year: number) => `Get the ${year} package`,
    // Packaging — flat per year, quoted verbatim
    pricingTitle: "What catch-up costs",
    pricingFlat: (fee: string) => `A flat ${fee} per year of catch-up.`,
    pricingTotal: (total: string, years: number) =>
      `${years} ${years === 1 ? "year" : "years"} — ${total} in total.`,
    pricingNone: "Your accountant will set the per-year price for your catch-up.",
    // Package (the end state)
    packageTitle: (year: number) => `${year} is caught up`,
    packageBody: "Sorted, reconciled, and ready to hand off. Download the year's package below.",
    // Generic
    done: "Done",
    close: "Close",
  },

  // ── Categorize (Review tab) ────────────────────────────────────────────────
  categorize: {
    loadingQueue: "Loading Penny's queue…",
    loadError: "Couldn't load the categorization queue. Try again.",
    allCaughtUpTitle: "All caught up 🎉",
    allCaughtUpBody:
      "Nothing is waiting to be categorized. New transactions land here as they import.",
    found: (n: number) => ({
      before: "Penny found ",
      count: n,
      after: ` ${n === 1 ? "transaction" : "transactions"} to categorize`,
    }),
    noDescription: "(no description)",
    askPenny: "Ask Penny",
    thinking: "Penny is thinking…",
    reachError: "Couldn't reach Penny — pick an account below.",
    suggestsPrefix: "Penny suggests ",
    learnedRule: "learned rule",
    sureSuffix: (pct: number) => `${pct}% sure`,
    notSure: "Penny isn't sure on this one — pick the right account.",
    approve: "Approve",
    defaultRationale: "Penny's best match for this transaction.",
  },

  // ── Chart of accounts ──────────────────────────────────────────────────────
  accounts: {
    count: (n: number) => `${n} accounts`,
    addAccount: "+ Add account",
    noAccountsTitle: "No accounts",
    noAccountsBody: "Add an account to start your chart of accounts.",
    codeLabel: "Code",
    codePlaceholder: "1000",
    nameLabel: "Name",
    namePlaceholder: "e.g. Cash — Checking",
    typeLabel: "Type",
    adding: "Adding…",
    addAccountSubmit: "Add account",
  },

  // ── Journal ────────────────────────────────────────────────────────────────
  journal: {
    count: (n: number) => `${n} entries`,
    newEntry: "+ New entry",
    needTwoAccounts: "Add at least two accounts before posting an entry.",
    noEntriesTitle: "No entries yet",
    noEntriesBody: "Post your first journal entry to start the books.",
    reversalLabel: "Reversal",
    reversalTag: "reversal",
    refPrefix: "ref: ",
    approve: "Approve",
    reverse: "Reverse",
    reversing: "Reversing…",
    dateLabel: "Date",
    memoLabel: "Memo",
    memoPlaceholder: "What is this entry?",
    colAccount: "Account",
    colDrCr: "Dr/Cr",
    colAmount: "Amount",
    debit: "Debit",
    credit: "Credit",
    amountPlaceholder: "0.00",
    addLine: "+ Add line",
    lineAccountAria: (i: number) => `Line ${i} account`,
    lineDrCrAria: (i: number) => `Line ${i} debit or credit`,
    lineAmountAria: (i: number) => `Line ${i} amount`,
    removeLineAria: (i: number) => `Remove line ${i}`,
    balanceIndicator: (dr: string, cr: string, balanced: boolean) =>
      `Dr ${dr} · Cr ${cr}${balanced ? " · balanced" : " · not balanced"}`,
    posting: "Posting…",
    postEntry: "Post entry",
  },

  // ── Reports ────────────────────────────────────────────────────────────────
  reports: {
    pnl: "P&L",
    trialBalance: "Trial balance",
    balanceSheet: "Balance sheet",
    pnlEmptyTitle: "Nothing to report yet",
    pnlEmptyBody: "Post income and expense entries to see your P&L.",
    revenue: "Revenue",
    totalRevenue: "Total revenue",
    expenses: "Expenses",
    totalExpenses: "Total expenses",
    netIncome: "Net income",
    tbEmptyTitle: "No balances yet",
    tbEmptyBody: "Post entries to see the trial balance.",
    colAccount: "Account",
    colDebit: "Debit",
    colCredit: "Credit",
    totals: "Totals",
    tbDoesNotTie: "Trial balance does not tie — debits ≠ credits.",
    bsEmptyTitle: "Nothing on the balance sheet yet",
    bsEmptyBody: "Post entries to see assets, liabilities, and equity.",
    assets: "Assets",
    totalAssets: "Total assets",
    liabilities: "Liabilities",
    totalLiabilities: "Total liabilities",
    equity: "Equity",
    currentEarnings: "Current earnings",
    totalEquity: "Total equity",
    accountingEquation: "Assets = Liabilities + Equity",
    balanced: "Balanced",
    outOfBalance: "Out of balance",
    // ── W1.2 · report exports (APPENDED block — integrator merges additive keys) ──
    generalLedger: "General ledger",
    glEmptyTitle: "No ledger activity yet",
    glEmptyBody: "Post entries to see the full general ledger with running balances.",
    glColDate: "Date",
    glColAccount: "Account",
    glColMemo: "Memo",
    glColDebit: "Debit",
    glColCredit: "Credit",
    glColBalance: "Running balance",
    exportAllTime: "All time",
    exportFrom: "From",
    exportTo: "To",
    exportAsOf: "As of",
    downloadCsv: "Download CSV",
    downloadPdf: "Download PDF",
    exporting: "Preparing…",
    exportError: "Could not prepare the download. Try again.",
    exportScopeAria: "Report period",
    // ── W2.5 · 1099-NEC contractor summary (APPENDED block — additive keys) ──
    nec: "1099-NEC",
    necTaxYear: "Tax year",
    necEmptyTitle: "No 1099 contractors yet",
    necEmptyBody: "Tag a payment with a 1099-eligible vendor and it will show up here at year end.",
    necColVendor: "Vendor",
    necColW9: "W-9",
    necColTin: "TIN",
    necColReportable: "1099-NEC amount",
    necColExcluded: "Excluded (card / 1099-K)",
    necColMustFile: "Must file",
    necW9OnFile: "On file",
    necW9Missing: "Missing",
    necMustFileYes: "Yes",
    necMustFileNo: "No",
    necTotalToFile: "Total to file",
    necThresholdNote: "The $ threshold comes from current IRS rules — Penny keeps it up to date.",
    // ── W4.2 · cash-flow statement (GAAP indirect) (APPENDED block — additive keys) ──
    cashFlow: "Cash flow",
    cfEmptyTitle: "No cash movement yet",
    cfEmptyBody: "Post entries with cash accounts to see where your cash came from and went.",
    cfOperating: "Operating activities",
    cfInvesting: "Investing activities",
    cfFinancing: "Financing activities",
    cfNetIncome: "Net income",
    cfOperatingTotal: "Net cash from operating activities",
    cfInvestingTotal: "Net cash from investing activities",
    cfFinancingTotal: "Net cash from financing activities",
    cfNetChange: "Net change in cash",
    cfBeginningCash: "Cash at beginning of period",
    cfEndingCash: "Cash at end of period",
    cfTiesNote: "Ties to the change in cash on your balance sheet.",
    cfDoesNotTie: "Cash flow does not tie to the balance-sheet cash change.",
    // ── W4.4 · lender / due-diligence package (APPENDED block — additive keys) ──
    pkg: "Lender package",
    pkgTitle: "Lender / due-diligence package",
    pkgBody: "One export a lender or buyer can rely on: your P&L, balance sheet, cash flow, and AR/AP aging — with a prior-period comparison and a cover sheet — assembled into a single CSV or PDF.",
    pkgComparePrior: "Compare to the prior period",
    pkgIncludes: "Includes P&L · balance sheet · cash flow · AR/AP aging · cover sheet",
    pkgArAging: "Accounts receivable aging",
    pkgApAging: "Accounts payable aging",
  },

  // ── Periods ────────────────────────────────────────────────────────────────
  periods: {
    noPeriodsTitle: "No periods yet",
    noPeriodsBody: "Periods are created automatically the first time you post into a month.",
    close: "Close",
    reopen: "Reopen",
  },

  // ── Import flow ────────────────────────────────────────────────────────────
  importFlow: {
    intro: "Bring your existing books in. Nothing posts until you confirm.",
    bankCsvTitle: "Bank statement (CSV)",
    bankCsvSub: "Upload a transactions export — map the columns and we'll post them.",
    openingTitle: "Opening balances",
    openingSub: "Start the books at a cutover date with each account's balance.",
    csvHeader: "Bank statement CSV",
    csvSummary: (rows: number, filename: string) => `${rows} rows · ${filename}`,
    chooseCsv: "Choose a CSV file…",
    readFileError: "Couldn't read that file.",
    dateColumn: "Date column",
    descriptionColumn: "Description column",
    amountColumn: "Amount column",
    positiveAmountsAre: "Positive amounts are",
    moneyIn: "money in (deposits)",
    moneyOut: "money out (withdrawals)",
    dateFormat: "Date format",
    dateMdy: "Month/Day/Year (US)",
    dateDmy: "Day/Month/Year (UK/EU)",
    bankAccount: "Bank account",
    defaultCategory: "Where should these go by default?",
    defaultCategoryAria: "Default category for imported transactions",
    colDate: "Date",
    colDescription: "Description",
    colAmount: "Amount",
    colOk: "OK",
    andMore: (n: number) => `…and ${n} more`,
    rowsReady: (ready: number, total: number) => `${ready} of ${total} rows ready`,
    importing: "Importing…",
    importN: (n: number) => `Import ${n} transactions`,
    doneTitle: (n: number) => `Imported ${n} ${n === 1 ? "transaction" : "transactions"}.`,
    doneBody:
      "They're in. Penny will help you sort each one into the right category — review or adjust any of them anytime from the Journal.",
    backToBooks: "Back to the books",
    // Opening balances
    openingHeader: "Opening balances at cutover",
    cutoverDate: "Cutover date",
    obColBalance: "Balance",
    addAccount: "+ Add account",
    rowAccountAria: (i: number) => `Row ${i} account`,
    rowDrCrAria: (i: number) => `Row ${i} debit or credit`,
    rowBalanceAria: (i: number) => `Row ${i} balance`,
    removeRowAria: (i: number) => `Remove row ${i}`,
    obBalanceIndicator: (dr: string, cr: string) => `Debits ${dr} · Credits ${cr}`,
    obPlug: (amount: string) => ` · we'll balance ${amount} into an opening-balance account`,
    obPartial: (rows: string, plural: boolean) =>
      `Row${plural ? "s" : ""} ${rows} need both an account and a balance — fill both or clear the row before importing.`,
    obPosting: "Posting…",
    obImport: "Import opening balances",
    obDoneTitle: "Opening balances saved.",
    obDoneBody: (cutover: string) =>
      `Your starting balances are in as of ${cutover}. Any difference between your debits and credits was balanced into an Opening Balance Equity account for your accountant to review.`,
    obDescription: "Opening balance",
    // Connect software
    connectHeading: "Or connect your accounting software",
    connectLead:
      "Pull your chart of accounts and history straight from QuickBooks or Xero. Transactions arrive as a preview you confirm.",
    connectCheckError: "Couldn't check your connected software — reload to try again.",
    approveInTab: "Approve access in the new tab, then come back and click Pull.",
    pulledSummary: (accounts: number, ready: number) =>
      `Pulled ${accounts} accounts and staged ${ready} transactions for review.`,
    providerConnected: (label: string) => `${label} connected`,
    opening: "Opening…",
    connectProvider: (label: string) => `Connect ${label}`,
    pulling: "Pulling…",
    pullHistory: "Pull history",
    // column select
    colSelectNone: "— none —",
    colSelectSelect: "Select…",
    colSelectFallback: (i: number) => `Column ${i}`,
    // ── Bank feeds (Plaid, W2.3) ─────────────────────────────────────────────
    bankHeading: "Connect your bank",
    bankLead:
      "Link your bank and new transactions flow straight into Penny's queue — no more downloading statements. Penny categorizes them for you.",
    connectBank: "Connect a bank",
    bankConnecting: "Opening your bank…",
    bankSyncing: "Bringing in transactions…",
    bankConnected: (name: string) => `${name} connected`,
    bankLinkError: "Couldn't start the bank connection — reload to try again.",
    bankSyncSummary: (added: number) =>
      `Brought in ${added} ${added === 1 ? "transaction" : "transactions"} — find them in Review.`,
    bankNothingNew: "No new transactions since the last sync.",
    syncNow: "Sync now",
    bankCancelled: "Bank connection canceled — nothing was linked.",
  },

  // ── Provider labels (QBO / Xero / bank feeds) ──────────────────────────────
  providers: {
    qbo: "QuickBooks",
    xero: "Xero",
    plaid: "your bank",
  },

  // ── W2.2 one-click migration (QBO history + trial-balance comparison) ───────
  migration: {
    heading: "Bring your full history over",
    lead:
      "Pull every account and transaction from QuickBooks, then check the numbers side by side before anything posts.",
    migrateButton: (label: string) => `Migrate everything from ${label}`,
    migrating: "Pulling your history…",
    pulledSummary: (accounts: number, txns: number, years: number) =>
      `Pulled ${accounts} accounts and ${txns} transactions across ${years} ${years === 1 ? "year" : "years"}.`,
    reviewHeading: "Review and confirm",
    step1: "1 · Account mapping",
    step1Body: "Each QuickBooks account was matched to one in your books. Rename or recategorize any before you post.",
    step2: "2 · Post the history",
    step2Body: "Post each year's transactions. Re-running is safe — anything already imported is skipped, never doubled.",
    step3: "3 · Compare trial balances",
    step3Body: "Line up your new trial balance against QuickBooks' own, account by account. Any difference is shown, never hidden.",
    step4: "4 · Set your cutover date",
    step4Body: "The date your books officially start in the new system.",
    postYear: (year: string) => `Post ${year}`,
    posting: "Posting…",
    posted: (n: number) => `${n} posted`,
    duplicatesSkipped: (n: number) => `${n} already imported (skipped)`,
    errorsCount: (n: number) => `${n} need attention`,
    // Trial-balance comparison
    tbHeading: "Trial balance — you vs QuickBooks",
    tbAsOf: (date: string) => `QuickBooks trial balance as of ${date}`,
    tbNoSnapshot: "QuickBooks didn't return a trial balance to compare against — check the numbers in the Reports tab.",
    tbColAccount: "Account",
    tbColProvider: "QuickBooks",
    tbColLedger: "Your books",
    tbColDiff: "Difference",
    tbTies: "Every account ties to the cent. Your books match QuickBooks exactly.",
    tbVariance: (amount: string) => `${amount} of differences to explain across the accounts below.`,
    tbProviderOnly: "Only in QuickBooks",
    tbLedgerOnly: "Only in your books",
    tbRefresh: "Refresh comparison",
    // Cutover
    cutoverLabel: "Cutover date",
    cutoverHelp: "Your books start here. Everything before it came from QuickBooks.",
    confirmCutover: "Confirm cutover date",
    savingCutover: "Saving…",
    doneTitle: "Migration complete.",
    doneBody: (date: string) => `Your history is in and your books start ${date}. Penny will help you keep them tidy from here.`,
    errorGeneric: "Something went wrong — reload and try again.",
  },

  // ── Account type labels (owner-facing chart-of-accounts groupings) ─────────
  // Keys mirror the AccountType union in ledger/types.ts.
  accountTypes: {
    asset: "asset",
    liability: "liability",
    equity: "equity",
    income: "income",
    expense: "expense",
  },

  // ── Nav tab labels (owner + CPA) ───────────────────────────────────────────
  tabs: {
    home: "Home",
    review: "Review",
    reports: "Reports",
    connections: "Connections",
    advanced: "Advanced",
    journal: "Journal",
    chartOfAccounts: "Chart of accounts",
    periods: "Periods",
    overview: "Overview",
    categorize: "Categorize",
    books: "Books",
    accounts: "Accounts",
    import: "Import",
    rules: "Rules",
    reconcile: "Reconcile",
  },

  // ── Learned rules (W1.6 — Categorize → Rules) ──────────────────────────────
  // Owner/CPA sees every shortcut Penny has learned and can remove a bad one.
  rules: {
    loading: "Loading Penny's rules…",
    loadError: "Couldn't load Penny's rules. Try again.",
    emptyTitle: "No rules yet",
    emptyBody:
      "As you categorize, Penny remembers your choices so she can handle the same kind of transaction next time. Those shortcuts show up here.",
    lead:
      "These are the shortcuts Penny has learned from you. Remove any that are sending transactions to the wrong place.",
    count: (n: number) => `${n} ${n === 1 ? "rule" : "rules"}`,
    colPattern: "When a transaction looks like",
    colAccount: "Penny files it under",
    colLearnedFrom: "Learned from",
    colHits: "Used",
    hits: (n: number) => `${n}×`,
    learnedFromPenny: "Penny",
    learnedFromHuman: "You",
    matchExact: "matches exactly",
    matchContains: "contains",
    matchSourceRef: "reference",
    deleteAria: (pattern: string) => `Delete the rule for ${pattern}`,
    deleteLabel: "Delete",
    deleting: "Removing…",
    readOnlyNote: "You have read-only access — you can see Penny's rules but not change them.",
    // Confirm dialog (the card's required "Penny will stop applying it" line).
    confirmTitle: "Remove this rule?",
    confirmBody: (pattern: string) =>
      `Penny will stop applying it. Transactions that look like “${pattern}” won't be filed automatically anymore — you can still categorize them yourself.`,
    confirmDelete: "Remove rule",
    confirmCancel: "Keep it",
    deleteError: "Couldn't remove that rule. Try again.",
  },

  // ── CPA Practice home (card W1.4) ──────────────────────────────────────────
  // The firm-level landing: one ranked list of what needs the CPA across every
  // client. VOICE.md — plain, calm, action-first; no exclamation marks.
  practice: {
    eyebrow: "Practice",
    title: "What needs you",
    loading: "Loading your clients' books…",
    loadError: "Couldn't load your practice queue. Try again.",
    allClearTitle: "All caught up",
    allClearBody:
      "Nothing needs you across your clients right now. New items land here as they come in.",
    noClientsTitle: "No clients yet",
    noClientsBody:
      "Add your first client from the switcher above and their work will show up here.",
    // Section headers
    queueHeading: "Across your clients",
    clientsHeading: "Clients",
    resolvedHeading: (n: number) => `All clear (${n})`,
    // Item-kind labels (the row's action word — data label, ordered by urgency)
    kind: {
      pending_review: "Waiting for approval",
      uncategorized: "Needs a category",
      unreconciled: "Import to reconcile",
      flagged: "Flagged",
      upcoming_close: "Period to close",
    } as Record<string, string>,
    // Row CTA per kind (what the ≤2-tap resolution lands on)
    cta: {
      pending_review: "Review",
      uncategorized: "Categorize",
      unreconciled: "Reconcile",
      flagged: "Open",
      upcoming_close: "Close",
    } as Record<string, string>,
    ctaReadonly: "View",
    // Switcher / client-card count summaries
    itemsCount: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
    allClearChip: "All clear",
    openClientAria: (name: string) => `Open ${name}'s books`,
    queueAria: "Cross-client work queue",
  },

  // ── CPA collaboration primitives (card W1.5) ───────────────────────────────
  // How a CPA collaborates without moving money unilaterally, and how the owner
  // sees that activity as trust-tiered "needs-a-look" items. VOICE.md — calm,
  // plain, no exclamation marks; the owner is never made to feel behind.
  collab: {
    // CPA-side affordances (on a posted entry)
    flag: "Flag",
    flagged: "Flagged",
    unflag: "Clear flag",
    flagReasonPlaceholder: "What should the owner look at? (optional)",
    flagSubmit: "Flag for review",
    addNote: "Add a note",
    notePlaceholder: "Leave a note on this entry…",
    noteSubmit: "Save note",
    suggestReclass: "Suggest a category",
    suggestTo: "Move to",
    suggestNotePlaceholder: "Why this category? (optional)",
    suggestSubmit: "Suggest to owner",
    working: "Working…",
    activityHeading: "Notes & flags",
    noActivity: "No notes or flags yet.",
    flagBadge: "Flagged for review",
    // Owner-side needs-a-look surface (the suggestion inbox)
    inboxEyebrow: "From your accountant",
    inboxTitle: "A few things to approve",
    inboxLoading: "Loading your accountant's suggestions…",
    inboxError: "Couldn't load your accountant's suggestions. Try again.",
    inboxEmptyTitle: "Nothing to approve",
    inboxEmptyBody:
      "When your accountant suggests a change or adds a transaction, it lands here for your approval before it hits the books.",
    tierMedium: "Needs your OK",
    kindReclass: "Category change",
    kindAddTxn: "New transaction",
    reclassSummary: (from: string, to: string) => `Move from ${from} to ${to}`,
    addTxnSummary: (date: string, amount: string) => `${date} · ${amount}`,
    approve: "Approve",
    reject: "Not now",
    approving: "Approving…",
    rejecting: "Declining…",
    approvedNote: "Approved — it's on the books.",
    // errors
    actionError: "Couldn't do that just now. Try again.",
  },

  // ── W1.1 · bank reconciliation (APPENDED block — integrator merges additive keys) ──
  // CPA-facing (Books → Reconcile) + the owner's "Reconciled ✓" chip on Home. Keep
  // it plain: pick account + month → auto-match → clear the short list → ✓.
  reconcile: {
    eyebrow: "Reconciliation",
    lead: "Match this account's statement against the books, month by month. Penny auto-matches the obvious ones — you resolve what's left.",
    accountLabel: "Account",
    accountAria: "Account to reconcile",
    statementEndLabel: "Statement date",
    statementEndAria: "Statement closing date",
    openingLabel: "Opening balance",
    closingLabel: "Closing balance",
    openingAria: "Statement opening balance",
    closingAria: "Statement closing balance",
    startReconciling: "Start reconciling",
    autoMatch: "Auto-match",
    autoMatching: "Matching…",
    autoMatchedN: (n: number) => `Penny matched ${n} ${n === 1 ? "line" : "lines"} automatically.`,
    exactBadge: "exact",
    fuzzyBadge: "close date",
    manualBadge: "manual",
    matchedTitle: "Matched",
    matchedCount: (n: number) => `${n} matched`,
    unmatchedTitle: "Needs your attention",
    unmatchedLead: "These statement lines don't have a matching entry yet. Match one, or create the missing entry.",
    noUnmatched: "Every statement line is matched.",
    colDate: "Date",
    colDescription: "Description",
    colAmount: "Amount",
    match: "Match",
    matching: "Matching…",
    unmatch: "Unmatch",
    unmatching: "Unmatching…",
    pickEntry: "Match to an entry…",
    createMissing: "Create missing entry",
    // The tie-out summary (opening / cleared / outstanding / closing).
    summaryOpening: "Opening",
    summaryCleared: "Cleared",
    summaryOutstanding: "Outstanding",
    summaryClosing: "Closing",
    summaryDifference: "Difference",
    tiesOut: "This account ties to the statement — you're clear to reconcile.",
    doesNotTie: (amount: string) => `Off by ${amount}. Resolve the difference before reconciling.`,
    lock: "Reconcile ✓",
    locking: "Reconciling…",
    reconciledChip: "Reconciled ✓",
    reconciledOn: (date: string) => `Reconciled on ${date}`,
    reopen: "Reopen",
    reopening: "Reopening…",
    lockedNote: "This month is reconciled and locked. Reopen it to make changes.",
    reopenedByReversal: "A reversal reopened a matched line — this month needs another look.",
    loadError: "Couldn't load reconciliation. Try again.",
    readonlyNote: "You have read-only access — matching and reconciling are disabled.",
    selectAccountFirst: "Pick a bank or cash account to reconcile.",
    noStatementLines: "No statement lines for this account yet. Import a bank statement first.",
    // Owner Home chip (owners never reconcile — they just see the status).
    homeReconciled: (n: number) =>
      `Reconciled ✓ — ${n} ${n === 1 ? "account" : "accounts"} tied to statement.`,
    homeReconciledDate: (date: string) => `Last reconciled ${date}.`,
  },

  // ── W3.4 · Owner Home ("am I okay?") pulse ─────────────────────────────────
  // The one-screen answer: cash, what needs you, coming-up deadlines, what's
  // reconciled, a plain-English month summary. 'app' persona voice (VOICE.md):
  // warm, no jargon, no exclamation marks, lead with the human answer. No
  // accounting vocabulary — this is the owner's surface. Deadlines + numbers are
  // interpolated from live data; only the framing words live here.
  ownerHome: {
    cashLabel: "Money on hand",
    cashSubCash: "Across your bank and cash accounts.",
    cashSubAssets: "Your total assets — add a bank account to track cash on its own.",
    needsYouLabel: "Needs you",
    needsYouNone: "You're all caught up — nothing needs you right now.",
    needsYouSome: (n: number) =>
      `${n} ${n === 1 ? "thing" : "things"} ${n === 1 ? "needs" : "need"} a quick decision.`,
    needsYouAction: "Review",

    // Coming-up filing deadlines (from the kernel — never a hardcoded calendar).
    deadlinesTitle: "Coming up",
    deadlinesNone: "Nothing on the calendar in the next few months.",
    deadlineDue: (days: number) =>
      days <= 0 ? "due today"
        : days === 1 ? "due tomorrow"
        : `due in ${days} days`,
    deadlineOn: (date: string) => `on ${date}`,

    // Plain-English month summary (theme #8). Warm, comparative, no jargon.
    summaryTitle: "Your month so far",
    summaryQuiet: "It's quiet so far this month — no income or spending recorded yet.",
    summaryNet: (net: string) => `You're net ${net} this month.`,
    summaryUpFromLast: (delta: string) => ` That's ${delta} better than last month.`,
    summaryDownFromLast: (delta: string) => ` That's ${delta} lower than last month.`,
    summaryFlatFromLast: " About the same as last month.",
    summaryNoPrev: " Not enough history yet to compare to last month.",

    activityTitle: "Latest activity",
    noEntries: "No activity yet.",

    // Catch-up progress strip (W2.1) — per-year meter, only when a catch-up is live.
    catchUpDone: "✓",
    catchUpToGo: (n: number) => `${n} to go`,
  },

  // ── W2.4 · Quarterly estimated-tax assistant (Home strip) ──────────────────
  // Plain-language, no jargon, no exclamation marks. This is an ESTIMATE — every
  // surface carries the "not tax advice, confirm with your CPA" disclaimer. Rates
  // and deadlines are law-derived data (kernel), never named here.
  estimatedTax: {
    title: "Estimated taxes",
    // The headline: what to pay this quarter (safe-harbor, even split).
    perQuarter: (amount: string) => `About ${amount} for this quarter`,
    perQuarterSub: (year: number) => `Based on your ${year} profit so far, split evenly across four quarters.`,
    // Set-aside guidance.
    setAside: (pct: string, amount: string) =>
      `A safe habit: set aside ${pct} of what you earn — around ${amount} so far.`,
    // Component breakdown labels (resolved from EstimateComponent.labelKey).
    selfEmployment: "Self-employment tax",
    federalIncome: "Federal income tax",
    stateIncome: "State income tax",
    corporate: "Corporate income tax",
    breakdownTotal: (amount: string) => `Estimated ${amount} for the year`,
    // Deadline + penalty nudge (date-driven from the kernel calendar).
    dueSoon: (days: number, date: string) =>
      days <= 0 ? `Due today, ${date}` : days === 1 ? `Due tomorrow, ${date}` : `Due in ${days} days, on ${date}`,
    overdue: (date: string) =>
      `This quarter's payment was due ${date} — paying now can limit any underpayment penalty.`,
    penaltySoon: "Paying on time helps you avoid an underpayment penalty.",
    // Empty / unavailable states — omit the number, never fake one.
    noProfile: "Tell us your business type and we'll estimate your quarterly taxes.",
    noParams: "We don't have tax rates for your location yet — check back soon.",
    noEstimateEntity: "Your business type doesn't make quarterly estimated payments.",
    noProfit: "No profit to estimate taxes on yet this year.",
    // The standing disclaimer — shown wherever a number appears.
    disclaimer: "This is an estimate, not tax advice. Confirm with your CPA before you pay.",
    // A quiet link to the source (citation).
    learnMore: "See the official guidance",
  },

  // ── W3.3 · Minimal 3-step onboarding (name → entity → industry) ────────────
  // Exactly three steps. Entity + industry OPTIONS come from the kernel seeds,
  // never from here — only the framing words live in the catalog. 'app' persona,
  // VOICE.md: plain language, no jargon, no exclamation marks, lead with the human
  // moment, everything else asked in-journey.
  onboarding: {
    // Progress + shell
    stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
    back: "← Back",
    next: "Next",
    finishing: "Setting up your books…",
    loadError: "We couldn't load the setup options just now — please refresh.",
    // Step 1 — business name
    nameEyebrow: "Let's get you set up",
    nameTitle: "What's your business called?",
    nameLead: "This is the name on your books. You can change it later.",
    nameAria: "Business name",
    namePlaceholder: "Your business name",
    // Step 2 — entity type (tiles from entity_types seed)
    entityEyebrow: "How you're set up",
    entityTitle: "What kind of business is it?",
    entityLead: "This tells Penny how to treat money you take out and which forms you'll file.",
    entityNotSure: "I'm not sure",
    entityNotSureAria: "Help me figure out my business type",
    // Step 2b — the "not sure" diagnostic (questions come from the seed)
    diagnosticTitle: "A couple of quick questions",
    diagnosticLead: "Answer these and we'll suggest the right fit — you can always change it.",
    diagnosticYes: "Yes",
    diagnosticNo: "No",
    diagnosticResult: (label: string) => `Sounds like a ${label}.`,
    diagnosticInconclusive: "We couldn't pin it down from those answers — pick the closest one below, or leave it for now.",
    diagnosticUseThis: "Use this",
    diagnosticPickManually: "Choose from the list instead",
    // Step 3 — industry (tiles from industries seed)
    industryEyebrow: "Your line of work",
    industryTitle: "What does your business do?",
    industryLead: "We'll start your books with the accounts that fit your line of work.",
    finish: "Start my books",
    // Post-onboarding — bank connect offer (skippable; routes to Connections)
    doneEyebrow: "You're set up",
    doneTitle: (name: string) => `${name} is ready.`,
    doneLead: "Penny started your books with the right accounts. Connect a bank so transactions flow in automatically — or do it later.",
    connectBank: "Connect a bank",
    skipForNow: "I'll do this later",
    seededNote: (n: number) => `${n} ${n === 1 ? "account" : "accounts"} added to your chart.`,
    errFinish: "We couldn't finish setting up your books. Please try again.",
  },

  // ── W3.2 · Trust-tiered autonomy (the ≤5-asks/week approval rework) ────────
  // Penny acts on what she's sure of, batches the maybes, and only asks about
  // true unknowns — honestly capped at ≤5 asks/week. All copy here; the deeper
  // Penny voice for the rationale is the live 'app' persona (no shame, action-
  // first — VOICE.md). No exclamation marks.
  autonomy: {
    // "Penny did this" activity feed (high-confidence auto-posts).
    feedTitle: "Penny did this",
    feedLead: "High-confidence work Penny handled on her own. Undo anything that isn't right.",
    feedEmpty: "Nothing yet — as transactions come in, the ones Penny is sure about land here, already done.",
    feedLoading: "Loading what Penny's done…",
    feedError: "Couldn't load Penny's activity. Try again.",
    filedUnder: (account: string) => `Filed under ${account}`,
    viaRule: "learned rule",
    viaVendor: "repeat vendor",
    viaPenny: "Penny's call",
    undo: "Undo",
    undoing: "Undoing…",
    undone: "Undone",
    undoError: "Couldn't undo that. Try again.",
    sureSuffix: (pct: number) => `${pct}% sure`,

    // Interruption budget — the honest ≤5/week cap.
    budgetLine: (spent: number, budget: number) =>
      `${spent} of ${budget} questions this week`,
    budgetClear: (budget: number) => `No questions this week yet — up to ${budget} if something needs you.`,
    budgetSpent: "That's this week's questions. Anything else Penny wasn't sure about is waiting in your weekly summary instead of interrupting you.",

    // Batch-approve (medium tier).
    batchTitle: "Ready for a quick yes",
    batchLead: "Penny's fairly sure about these. Approve them all, or open one to change it.",
    batchCount: (n: number) => `${n} ${n === 1 ? "transaction" : "transactions"} to confirm`,
    approveAll: "Approve all",
    approving: "Approving…",

    // Low-confidence card.
    askTitle: "A few need your call",
    askLead: "Penny couldn't be sure on these. Pick where each belongs.",
    deferredNote: "Some lower-priority items are waiting in your weekly summary rather than interrupting you.",
  },

  // ── Receipts (W3.5) — capture + match, from the 'app' persona voice ──────────
  receipts: {
    // Capture entry — lives inline in Home/Review + on a transaction row (no new tab).
    capture: "Add a receipt",
    captureLead: "Snap or paste a receipt — Penny files it with the right transaction.",
    capturePhoto: "Take a photo",
    capturePaste: "Paste receipt text",
    pastePlaceholder: "Paste the receipt text (vendor, total, date)…",
    reading: "Reading your receipt…",
    matching: "Finding its transaction…",
    captureError: "Couldn't read that receipt. Try a clearer photo, or paste the text.",

    // High-confidence auto-attach outcome.
    attachedTitle: "Filed with your books",
    attachedLine: (vendor: string, amount: string) => `Kept your ${amount} receipt from ${vendor} with its transaction.`,

    // Low-confidence confirm card (in Review).
    confirmTitle: "Is this the right transaction?",
    confirmLead: "Penny thinks this receipt goes here. One tap to confirm, or pick another.",
    confirm: "Yes, attach it",
    confirming: "Attaching…",
    notThis: "Not this one",

    // Unmatched queue — resolvable in-flow.
    unmatchedTitle: "Receipts waiting on a transaction",
    unmatchedLead: "Penny couldn't find a matching charge yet. Point each one at its transaction, or set it aside.",
    unmatchedEmpty: "No receipts waiting — everything's filed.",
    dismiss: "Set aside",
    pickTransaction: "Choose a transaction",

    // On a transaction row.
    hasReceipt: "Receipt attached",
    viewReceipt: "View receipt",
    detach: "Remove receipt",
    detaching: "Removing…",
  },

  // ── W3.1 · Penny thread (conversational activity + grounded Q&A) ───────────
  // The thread makes Penny feel alive on the owner's REAL books: she greets,
  // narrates what she did (the W3.2 feed), and answers factual questions grounded
  // on the actual ledger — never an invented number. The STRUCTURAL labels live
  // here; Penny's answer prose comes from the live 'app' persona (no redeploy).
  // VOICE.md — plain, warm, no jargon, no exclamation marks.
  thread: {
    title: "Ask Penny",
    lead: "Ask about your money — what you spent, brought in, or have on hand. Penny answers from your real books.",
    // The idle greeting Penny opens with (structural; persona colors the answers).
    greeting: "Hi — I'm keeping an eye on your books. Ask me anything about your money, or see what I've handled below.",
    // Activity narration intro (links to the "Penny did this" feed just below).
    activityIntro: "Here's what I've taken care of lately — it's all in the feed below, and you can undo anything.",
    activityNone: "Nothing new to report yet. As transactions come in, I'll handle the clear ones and note them here.",
    // Input
    inputAria: "Ask Penny a question about your books",
    inputPlaceholder: "e.g. how much did I spend on software in Q2?",
    send: "Ask",
    sending: "Penny's checking your books…",
    error: "Couldn't reach Penny just now. Try again.",
    readOnly: "You can ask Penny about these books, but not make changes.",
    // A plain, non-numeric affordance. The thread is owner-INITIATED Q&A, which is
    // NOT an interruption (Nik, 3 Jul), so it does not consume the ≤5/week
    // interruption budget — that budget governs Penny's own low-confidence asks
    // (surfaced in Categorize), not questions the owner chooses to ask here. We do
    // NOT show an interruption counter the thread doesn't govern (Wave-3 audit F2).
    askHint: "Ask as much as you like — asking here is free and never counts against your weekly summary.",
    // A few suggested prompts to make the surface discoverable.
    suggestSpend: "What did I spend this month?",
    suggestIncome: "How much did I bring in this year?",
    suggestCash: "How much cash do I have?",
    // Speaker labels for the turn list.
    youLabel: "You",
    pennyLabel: "Penny",
  },
} as const;

export type Copy = typeof COPY;
