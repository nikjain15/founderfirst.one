import { parseCsv, parseDateCell, parseAmountCell } from "./csv.ts";

let fails = 0;
const seg = (t: string) => console.log(`\n=== ${t} ===`);
function show(label: string, got: unknown, expect?: unknown) {
  const ok = expect === undefined ? "" : (JSON.stringify(got) === JSON.stringify(expect) ? "  ✔" : "  ✘ MISMATCH");
  if (ok.includes("✘")) fails++;
  console.log(`${label.padEnd(34)} -> ${JSON.stringify(got)}${ok}`);
}

// Does Postgres accept this ISO date? (mirror of `::date` cast)
function pgDateValid(iso: string | null): boolean {
  if (iso === null) return true; // null casts fine
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [_, y, mo, d] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  return dt.getUTCFullYear() === +y && dt.getUTCMonth() === +mo - 1 && dt.getUTCDate() === +d;
}

seg("DATE FORMAT — US m/d/y vs UK d/m/y (same file must flip)");
show("03/04/2026 mdy", parseDateCell("03/04/2026", "mdy"), "2026-03-04");
show("03/04/2026 dmy", parseDateCell("03/04/2026", "dmy"), "2026-04-03");
show("13/04/2026 mdy (auto d/m)", parseDateCell("13/04/2026", "mdy"), "2026-04-13");
show("13/13/2026 (impossible)", parseDateCell("13/13/2026", "mdy"), null);
show("00/05/2026 (month 0)", parseDateCell("00/05/2026", "mdy"), null);

seg("DATE — IMPOSSIBLE CALENDAR DATES that pass the regex (di<=31)");
const impossible = ["02/30/2026","02/31/2026","04/31/2026","06/31/2026","09/31/2026","11/31/2026","02/29/2027"];
for (const v of impossible) {
  const out = parseDateCell(v, "mdy");
  const pgOk = pgDateValid(out);
  console.log(`${v.padEnd(34)} -> ${JSON.stringify(out)}   Postgres ::date accepts? ${pgOk ? "yes" : "NO → cast THROWS, aborts whole batch"}`);
  if (out !== null && !pgOk) fails++;
}
show("02/29/2028 (leap, valid)", parseDateCell("02/29/2028", "mdy"), "2028-02-29");

seg("AMOUNT — US / EU / parens / sub-cent");
show("$1,234.56", parseAmountCell("$1,234.56"), 123456);
show("1.234,56 (EU)", parseAmountCell("1.234,56"), 123456);
show("(45.00) parens neg", parseAmountCell("(45.00)"), -4500);
show("-50", parseAmountCell("-50"), -5000);
show("1234,56 (EU bare)", parseAmountCell("1234,56"), 123456);
show("1,234 (US thousands)", parseAmountCell("1,234"), 123400);
show("1.005 sub-cent reject", parseAmountCell("1.005"), null);
show("blank", parseAmountCell(""), null);
show("99999999999999999999 (overflow)", Number.isSafeInteger(parseAmountCell("99999999999999999999") as number), false);

seg("CSV PARSER — blank / header-only / delimiter / BOM");
show("empty file", parseCsv(""), { headers: [], rows: [] });
show("header-only rows.length", parseCsv("Date,Desc,Amount\n").rows.length, 0);
const bom = parseCsv("﻿Date,Amount\n01/02/2026,5.00\n");
show("UTF-8 BOM header[0]", bom.headers[0], "Date");
const semi = parseCsv("Date;Desc;Amount\n01/02/2026;Coffee;-5,00\n");
show("semicolon-delim headers.length", semi.headers.length, 3);
console.log("   ^ if 1, the whole row is one field → date & amount columns unusable (EU exports)");
const tab = parseCsv("Date\tDesc\tAmount\n01/02/2026\tCoffee\t-5.00\n");
show("tab-delim headers.length", tab.headers.length, 3);

console.log(`\n──────────── ${fails === 0 ? "ALL EXPECTATIONS MET" : fails + " ASSERTION FAILURE(S) — see ✘ / NO above"} ────────────`);
