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
  },

  // ── Provider labels (QBO / Xero) ───────────────────────────────────────────
  providers: {
    qbo: "QuickBooks",
    xero: "Xero",
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
} as const;

export type Copy = typeof COPY;
