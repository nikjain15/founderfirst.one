/**
 * util/irsLookup.js — Category label → IRS line mapping.
 * Source: BookKeeping/demo/implementation/irs-routing.md v1.2
 * Used by: screens/card.jsx (IRS chip) and screens/books.jsx (form preview sheet).
 *
 * Coverage: all labels present in scenarios.json + irs-routing.md.
 * Lookup is case-insensitive + trimmed + whitespace-normalised (see irsLineChip).
 */

export const IRS_LINE_MAP = {
  // ── COGS (Schedule C Part III / Form line 2) ─────────────────────────────
  "cost of goods":                              { schedC: "Part III", form1120S: "2",  form1065: "2"  },
  "inventory (cogs)":                           { schedC: "Part III", form1120S: "2",  form1065: "2"  },
  "product inventory (cogs)":                   { schedC: "Part III", form1120S: "2",  form1065: "2"  },
  "food & ingredients (cogs)":                  { schedC: "Part III", form1120S: "2",  form1065: "2"  },
  "packaging":                                  { schedC: "22",       form1120S: "19", form1065: "20" },
  "packaging & supplies":                       { schedC: "22",       form1120S: "19", form1065: "20" },

  // ── Advertising / marketing ───────────────────────────────────────────────
  "advertising":                                { schedC: "8",   form1120S: "16", form1065: "20" },
  "marketing":                                  { schedC: "8",   form1120S: "16", form1065: "20" },

  // ── Vehicle / transportation ──────────────────────────────────────────────
  "vehicle fuel":                               { schedC: "9",   form1120S: "19", form1065: "20" },
  "vehicle fuel & maintenance":                 { schedC: "9",   form1120S: "19", form1065: "20" },
  "vehicle maintenance":                        { schedC: "9",   form1120S: "19", form1065: "20" },
  "vehicle & fuel":                             { schedC: "9",   form1120S: "19", form1065: "20" },
  "fuel & mileage":                             { schedC: "9",   form1120S: "19", form1065: "20" },
  "truck fuel":                                 { schedC: "9",   form1120S: "19", form1065: "20" },
  "truck fuel & maintenance":                   { schedC: "9",   form1120S: "19", form1065: "20" },
  "transportation":                             { schedC: "9",   form1120S: "19", form1065: "20" },
  // Vehicle loan principal is non-deductible; primary deductible = depreciation (Line 13)
  "vehicle depreciation & loan interest":       { schedC: "13",  form1120S: "14", form1065: "16c" },

  // ── Platform and processing ───────────────────────────────────────────────
  "platform fees":                              { schedC: "10",  form1120S: "19", form1065: "20" },
  "platform fees & processing":                 { schedC: "10",  form1120S: "19", form1065: "20" },
  "payment processing":                         { schedC: "10",  form1120S: "19", form1065: "20" },

  // ── Contractors / labor ───────────────────────────────────────────────────
  "contractors":                                { schedC: "11",  form1120S: "19", form1065: "20" },
  "subcontractors":                             { schedC: "11",  form1120S: "19", form1065: "20" },
  "contractor — helper (1099)":                 { schedC: "11",  form1120S: "19", form1065: "20" },
  "contractors & vendor payments":              { schedC: "11",  form1120S: "19", form1065: "20" },
  "rivera electric (subcontractor)":            { schedC: "11",  form1120S: "19", form1065: "20" },
  // S-Corp officer W-2 salary (reasonable comp) — not applicable to Sch C or Form 1065
  "shareholder payroll":                        { schedC: null,  form1120S: "7",  form1065: null },
  "payroll (w-2 employees)":                    { schedC: "26",  form1120S: "8",  form1065: "9"  },
  "payroll":                                    { schedC: "26",  form1120S: "8",  form1065: "9"  },

  // ── Insurance ────────────────────────────────────────────────────────────
  "insurance":                                  { schedC: "15",  form1120S: "19", form1065: "20" },
  "commercial insurance":                       { schedC: "15",  form1120S: "19", form1065: "20" },
  "camera/equipment insurance":                 { schedC: "15",  form1120S: "19", form1065: "20" },
  "camera insurance":                           { schedC: "15",  form1120S: "19", form1065: "20" },
  "professional liability insurance":           { schedC: "15",  form1120S: "19", form1065: "20" },
  "malpractice insurance":                      { schedC: "15",  form1120S: "19", form1065: "20" },

  // ── Legal / accounting ────────────────────────────────────────────────────
  "accounting":                                 { schedC: "17",  form1120S: "19", form1065: "20" },
  "legal fees":                                 { schedC: "17",  form1120S: "19", form1065: "20" },
  "professional fees":                          { schedC: "17",  form1120S: "19", form1065: "20" },

  // ── Office ────────────────────────────────────────────────────────────────
  "office supplies":                            { schedC: "18",  form1120S: "19", form1065: "20" },
  "printing & albums":                          { schedC: "18",  form1120S: "19", form1065: "20" },

  // ── Retirement ────────────────────────────────────────────────────────────
  "solo 401(k) contribution (employer portion)":{ schedC: "19",  form1120S: "17", form1065: "18" },
  // SEP-IRA is a personal Schedule 1 deduction for sole-props, not on Sch C
  "sep-ira contribution":                       { schedC: null,  form1120S: "17", form1065: "18" },

  // ── Rent / lease ─────────────────────────────────────────────────────────
  "van lease":                                  { schedC: "20a", form1120S: "11", form1065: "13" },
  "equipment rental":                           { schedC: "20a", form1120S: "11", form1065: "13" },
  "united rentals equipment":                   { schedC: "20a", form1120S: "11", form1065: "13" },
  "rent":                                       { schedC: "20b", form1120S: "11", form1065: "13" },
  "booth rent":                                 { schedC: "20b", form1120S: "11", form1065: "13" },
  "studio rent":                                { schedC: "20b", form1120S: "11", form1065: "13" },
  "office sublease":                            { schedC: "20b", form1120S: "11", form1065: "13" },
  "clinic lease":                               { schedC: "20b", form1120S: "11", form1065: "13" },
  "kitchen rental":                             { schedC: "20b", form1120S: "11", form1065: "13" },
  "commissary rent":                            { schedC: "20b", form1120S: "11", form1065: "13" },
  "venue fees":                                 { schedC: "20b", form1120S: "11", form1065: "13" },
  "venue & rental fees":                        { schedC: "20b", form1120S: "11", form1065: "13" },

  // ── Repairs ───────────────────────────────────────────────────────────────
  "repairs and maintenance":                    { schedC: "21",  form1120S: "9",  form1065: "11" },
  "repairs & maintenance":                      { schedC: "21",  form1120S: "9",  form1065: "11" },
  "equipment cleaning":                         { schedC: "21",  form1120S: "9",  form1065: "11" },

  // ── Supplies / materials / equipment ─────────────────────────────────────
  "supplies":                                   { schedC: "22",  form1120S: "19", form1065: "20" },
  "supplies & equipment":                       { schedC: "22",  form1120S: "19", form1065: "20" },
  "supplies & products":                        { schedC: "22",  form1120S: "19", form1065: "20" },
  "tools & equipment":                          { schedC: "22",  form1120S: "19", form1065: "20" },
  "tools & small equipment":                    { schedC: "22",  form1120S: "19", form1065: "20" },
  "hardware":                                   { schedC: "22",  form1120S: "19", form1065: "20" },
  "equipment":                                  { schedC: "22",  form1120S: "19", form1065: "20" },
  "props & supplies":                           { schedC: "22",  form1120S: "19", form1065: "20" },
  "safety supplies/ppe":                        { schedC: "22",  form1120S: "19", form1065: "20" },
  "safety & ppe":                               { schedC: "22",  form1120S: "19", form1065: "20" },
  "hard drives & storage":                      { schedC: "22",  form1120S: "19", form1065: "20" },
  "event supplies":                             { schedC: "22",  form1120S: "19", form1065: "20" },
  "event supplies & florals":                   { schedC: "22",  form1120S: "19", form1065: "20" },
  "medical supplies":                           { schedC: "22",  form1120S: "19", form1065: "20" },
  "materials":                                  { schedC: "22",  form1120S: "19", form1065: "20" },
  "job materials":                              { schedC: "22",  form1120S: "19", form1065: "20" },
  "materials — home depot":                     { schedC: "22",  form1120S: "19", form1065: "20" },
  "materials — graybar electric":               { schedC: "22",  form1120S: "19", form1065: "20" },
  "home depot materials":                       { schedC: "22",  form1120S: "19", form1065: "20" },
  "lowe's / ace materials":                     { schedC: "22",  form1120S: "19", form1065: "20" },
  "builders firstsource materials":             { schedC: "22",  form1120S: "19", form1065: "20" },

  // ── Licenses / permits / employer taxes ──────────────────────────────────
  "license renewal & permits":                  { schedC: "23",  form1120S: "12", form1065: "14" },
  "licenses & permits":                         { schedC: "23",  form1120S: "12", form1065: "14" },
  "permits":                                    { schedC: "23",  form1120S: "12", form1065: "14" },
  "permits & inspections":                      { schedC: "23",  form1120S: "12", form1065: "14" },
  "education & licensing":                      { schedC: "23",  form1120S: "12", form1065: "14" },
  "payroll taxes (employer share)":             { schedC: "23",  form1120S: "12", form1065: "14" },
  "payroll taxes":                              { schedC: "23",  form1120S: "12", form1065: "14" },

  // ── Travel ───────────────────────────────────────────────────────────────
  "travel":                                     { schedC: "24a", form1120S: "19", form1065: "20" },
  "travel & transport":                         { schedC: "24a", form1120S: "19", form1065: "20" },

  // ── Meals (50%) ───────────────────────────────────────────────────────────
  "business meals (50%)":                       { schedC: "24b", form1120S: "19", form1065: "20" },
  "client meals (50%)":                         { schedC: "24b", form1120S: "19", form1065: "20" },
  "travel & client meals (50%)":                { schedC: "24b", form1120S: "19", form1065: "20" },
  "meals & entertainment (50%)":                { schedC: "24b", form1120S: "19", form1065: "20" },

  // ── Utilities / communications ────────────────────────────────────────────
  "utilities":                                  { schedC: "25",  form1120S: "19", form1065: "20" },
  "phone":                                      { schedC: "25",  form1120S: "19", form1065: "20" },
  "internet":                                   { schedC: "25",  form1120S: "19", form1065: "20" },
  "phone & internet":                           { schedC: "25",  form1120S: "19", form1065: "20" },

  // ── Software / cloud / SaaS ───────────────────────────────────────────────
  "software subscriptions":                     { schedC: "27a", form1120S: "19", form1065: "20" },
  "software":                                   { schedC: "27a", form1120S: "19", form1065: "20" },
  "software & subscriptions":                   { schedC: "27a", form1120S: "19", form1065: "20" },
  "software & tools":                           { schedC: "27a", form1120S: "19", form1065: "20" },
  "software & saas tools":                      { schedC: "27a", form1120S: "19", form1065: "20" },
  "software (ehr & billing)":                   { schedC: "27a", form1120S: "19", form1065: "20" },
  "cloud infrastructure":                       { schedC: "27a", form1120S: "19", form1065: "20" },
  "cloud & hosting":                            { schedC: "27a", form1120S: "19", form1065: "20" },

  // ── Education / memberships / misc ────────────────────────────────────────
  "professional development":                   { schedC: "27a", form1120S: "19", form1065: "20" },
  "continuing education":                       { schedC: "27a", form1120S: "19", form1065: "20" },
  "education":                                  { schedC: "27a", form1120S: "19", form1065: "20" },
  "ce & supervision":                           { schedC: "27a", form1120S: "19", form1065: "20" },
  "bank fees":                                  { schedC: "27a", form1120S: "19", form1065: "20" },
  "miscellaneous business expenses":            { schedC: "27a", form1120S: "19", form1065: "20" },
  "professional memberships":                   { schedC: "27a", form1120S: "19", form1065: "20" },
  "neca membership":                            { schedC: "27a", form1120S: "19", form1065: "20" },
  "membership":                                 { schedC: "27a", form1120S: "19", form1065: "20" },
  "shipping & packaging":                       { schedC: "27a", form1120S: "19", form1065: "20" },
  "dump & disposal":                            { schedC: "27a", form1120S: "19", form1065: "20" },

  // ── Home office ───────────────────────────────────────────────────────────
  "home office":                                { schedC: "30",  form1120S: null, form1065: null },
  "home office / co-working":                   { schedC: "30",  form1120S: null, form1065: null },
};

/** Normalizes a category string before lookup: lowercase, trim, collapse whitespace, normalize apostrophes. */
function normalizeLabel(str) {
  return (str || "").toLowerCase().trim().replace(/\s+/g, " ").replace(/['\u2019]/g, "'");
}

/** Returns the line key ("schedC" | "form1120S" | "form1065") for a given entity value. */
export function lineKeyForEntity(entity) {
  if (entity === "s-corp")                       return "form1120S";
  if (entity === "llc-multi" || entity === "partnership") return "form1065";
  return "schedC"; // sole-prop, llc, llc-single, default
}

/**
 * Returns the SHORT form label for a given entity value — used inside the
 * compact IRS-line chip under expense categories ("Sch C · Line 24b",
 * "1120-S · Line 19"). For the FULL label ("Schedule C", "Form 1120-S",
 * "Form 1065") used in page titles and preview headings, use
 * `formLabelForEntity` from `constants/variants.js` instead.
 *
 * Renamed from `formLabelForEntity` in SCAF-2 (24/25 April 2026) to remove
 * the naming collision with the full-label helper.
 */
export function shortFormLabelForEntity(entity) {
  if (entity === "s-corp")                       return "1120-S";
  if (entity === "llc-multi" || entity === "partnership") return "1065";
  return "Sch C";
}

/** Returns the formatted chip string (e.g. "Sch C · Line 24b") or null. */
export function irsLineChip(category, entity) {
  if (!category) return null;
  const row = IRS_LINE_MAP[normalizeLabel(category)];
  if (!row) return null;
  const key = lineKeyForEntity(entity);
  if (!row[key]) return null;
  // COGS entries use "Part III" instead of a line number
  const linePart = row[key].startsWith("Part") ? row[key] : `Line ${row[key]}`;
  return `${shortFormLabelForEntity(entity)} · ${linePart}`;
}

/**
 * Groups an array of { category, amount } expense items by IRS line.
 * Returns an array of { line, lineLabel, items, subtotal } sorted by line number.
 * COGS groups ("Part III") sort before numbered lines; unmapped groups sort last.
 */
export function groupByIrsLine(expenses, entity) {
  const lineKey = lineKeyForEntity(entity);
  const form    = shortFormLabelForEntity(entity);
  const byLine  = {};

  for (const exp of expenses) {
    const row  = IRS_LINE_MAP[normalizeLabel(exp.category)];
    const line = row?.[lineKey] ?? null;
    const key  = line ?? "__unmapped__";
    const linePart  = line
      ? (line.startsWith("Part") ? line : `Line ${line}`)
      : null;
    const lineLabel = linePart ? `${form} · ${linePart}` : "Other / unmapped";
    if (!byLine[key]) byLine[key] = { line, lineLabel, items: [], subtotal: 0 };
    byLine[key].items.push(exp);
    byLine[key].subtotal += exp.amount;
  }

  return Object.values(byLine).sort((a, b) => {
    if (a.line === null) return 1;
    if (b.line === null) return -1;
    // "Part III" COGS sorts before all numbered lines
    if (a.line.startsWith("Part")) return -1;
    if (b.line.startsWith("Part")) return 1;
    // Stable sort for suffixed lines: "20a" < "20b" < "21"
    const numA = parseFloat(a.line);
    const numB = parseFloat(b.line);
    if (numA !== numB) return numA - numB;
    return a.line.localeCompare(b.line);
  });
}
