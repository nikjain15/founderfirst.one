/**
 * util/irsLookup.js — Category label → IRS line mapping.
 * Source: BookKeeping/demo/implementation/irs-routing.md v1.2
 * Used by: screens/card.jsx (IRS chip) and screens/books.jsx (form preview sheet).
 */

export const IRS_LINE_MAP = {
  "advertising":                                { schedC: "8",   form1120S: "16", form1065: "20" },
  "marketing":                                  { schedC: "8",   form1120S: "16", form1065: "20" },
  "vehicle fuel":                               { schedC: "9",   form1120S: "19", form1065: "20" },
  "fuel & mileage":                             { schedC: "9",   form1120S: "19", form1065: "20" },
  "truck fuel":                                 { schedC: "9",   form1120S: "19", form1065: "20" },
  "transportation":                             { schedC: "9",   form1120S: "19", form1065: "20" },
  "platform fees":                              { schedC: "10",  form1120S: "19", form1065: "20" },
  "payment processing":                         { schedC: "10",  form1120S: "19", form1065: "20" },
  "contractors":                                { schedC: "11",  form1120S: "19", form1065: "20" },
  "subcontractors":                             { schedC: "11",  form1120S: "19", form1065: "20" },
  "commercial insurance":                       { schedC: "15",  form1120S: "19", form1065: "20" },
  "camera/equipment insurance":                 { schedC: "15",  form1120S: "19", form1065: "20" },
  "camera insurance":                           { schedC: "15",  form1120S: "19", form1065: "20" },
  "professional liability insurance":           { schedC: "15",  form1120S: "19", form1065: "20" },
  "malpractice insurance":                      { schedC: "15",  form1120S: "19", form1065: "20" },
  "accounting":                                 { schedC: "17",  form1120S: "19", form1065: "20" },
  "legal fees":                                 { schedC: "17",  form1120S: "19", form1065: "20" },
  "professional fees":                          { schedC: "17",  form1120S: "19", form1065: "20" },
  "office supplies":                            { schedC: "18",  form1120S: "19", form1065: "20" },
  "solo 401(k) contribution (employer portion)":{ schedC: "19",  form1120S: "17", form1065: "18" },
  "van lease":                                  { schedC: "20a", form1120S: "11", form1065: "13" },
  "equipment rental":                           { schedC: "20a", form1120S: "11", form1065: "13" },
  "rent":                                       { schedC: "20b", form1120S: "11", form1065: "13" },
  "booth rent":                                 { schedC: "20b", form1120S: "11", form1065: "13" },
  "studio rent":                                { schedC: "20b", form1120S: "11", form1065: "13" },
  "office sublease":                            { schedC: "20b", form1120S: "11", form1065: "13" },
  "clinic lease":                               { schedC: "20b", form1120S: "11", form1065: "13" },
  "kitchen rental":                             { schedC: "20b", form1120S: "11", form1065: "13" },
  "commissary rent":                            { schedC: "20b", form1120S: "11", form1065: "13" },
  "repairs and maintenance":                    { schedC: "21",  form1120S: "9",  form1065: "11" },
  "supplies":                                   { schedC: "22",  form1120S: "19", form1065: "20" },
  "tools & equipment":                          { schedC: "22",  form1120S: "19", form1065: "20" },
  "tools & small equipment":                    { schedC: "22",  form1120S: "19", form1065: "20" },
  "hardware":                                   { schedC: "22",  form1120S: "19", form1065: "20" },
  "equipment":                                  { schedC: "22",  form1120S: "19", form1065: "20" },
  "props & supplies":                           { schedC: "22",  form1120S: "19", form1065: "20" },
  "safety supplies/ppe":                        { schedC: "22",  form1120S: "19", form1065: "20" },
  "license renewal & permits":                  { schedC: "23",  form1120S: "12", form1065: "14" },
  "licenses & permits":                         { schedC: "23",  form1120S: "12", form1065: "14" },
  "payroll taxes (employer share)":             { schedC: "23",  form1120S: "12", form1065: "14" },
  "travel":                                     { schedC: "24a", form1120S: "19", form1065: "20" },
  "business meals (50%)":                       { schedC: "24b", form1120S: "19", form1065: "20" },
  "client meals (50%)":                         { schedC: "24b", form1120S: "19", form1065: "20" },
  "utilities":                                  { schedC: "25",  form1120S: "19", form1065: "20" },
  "phone":                                      { schedC: "25",  form1120S: "19", form1065: "20" },
  "internet":                                   { schedC: "25",  form1120S: "19", form1065: "20" },
  "payroll (w-2 employees)":                    { schedC: "26",  form1120S: "8",  form1065: "9"  },
  "payroll":                                    { schedC: "26",  form1120S: "8",  form1065: "9"  },
  "software subscriptions":                     { schedC: "27a", form1120S: "19", form1065: "20" },
  "software":                                   { schedC: "27a", form1120S: "19", form1065: "20" },
  "cloud infrastructure":                       { schedC: "27a", form1120S: "19", form1065: "20" },
  "cloud & hosting":                            { schedC: "27a", form1120S: "19", form1065: "20" },
  "professional development":                   { schedC: "27a", form1120S: "19", form1065: "20" },
  "continuing education":                       { schedC: "27a", form1120S: "19", form1065: "20" },
  "bank fees":                                  { schedC: "27a", form1120S: "19", form1065: "20" },
  "miscellaneous business expenses":            { schedC: "27a", form1120S: "19", form1065: "20" },
  "professional memberships":                   { schedC: "27a", form1120S: "19", form1065: "20" },
  "home office":                                { schedC: "30",  form1120S: null, form1065: null  },
};

/** Returns the line key ("schedC" | "form1120S" | "form1065") for a given entity value. */
export function lineKeyForEntity(entity) {
  if (entity === "s-corp") return "form1120S";
  if (entity === "partnership") return "form1065";
  return "schedC"; // sole-prop, llc, default
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
  if (entity === "s-corp") return "1120-S";
  if (entity === "partnership") return "1065";
  return "Sch C";
}

/** Returns the formatted chip string (e.g. "Sch C · Line 24b") or null. */
export function irsLineChip(category, entity) {
  if (!category) return null;
  const row = IRS_LINE_MAP[category.toLowerCase()];
  if (!row) return null;
  const key = lineKeyForEntity(entity);
  return row[key] ? `${shortFormLabelForEntity(entity)} · Line ${row[key]}` : null;
}

/**
 * Groups an array of { category, amount } expense items by IRS line.
 * Returns an array of { line, lineLabel, items, subtotal } sorted by line number.
 */
export function groupByIrsLine(expenses, entity) {
  const lineKey = lineKeyForEntity(entity);
  const form    = shortFormLabelForEntity(entity);
  const byLine  = {};

  for (const exp of expenses) {
    const row  = IRS_LINE_MAP[(exp.category || "").toLowerCase()];
    const line = row?.[lineKey] ?? null;
    const key  = line ?? "__unmapped__";
    const lineLabel = line ? `${form} · Line ${line}` : "Other / unmapped";
    if (!byLine[key]) byLine[key] = { line, lineLabel, items: [], subtotal: 0 };
    byLine[key].items.push(exp);
    byLine[key].subtotal += exp.amount;
  }

  return Object.values(byLine).sort((a, b) => {
    // Sort mapped lines numerically (handle "27a", "20b" etc.), unmapped last
    if (a.line === null) return 1;
    if (b.line === null) return -1;
    return parseFloat(a.line) - parseFloat(b.line);
  });
}
