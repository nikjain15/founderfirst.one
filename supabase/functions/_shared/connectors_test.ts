// [stress:sync] Connector transform fuzz — guards the QBO/Xero parsing helpers
// against messy provider payloads. Run: `deno test supabase/functions/_shared/connectors_test.ts`
import { toMinor as xMinor, minorFactor as xFactor, xeroDate, mapXeroAccountType } from "./xero.ts";
import { toMinor as qMinor, minorFactor as qFactor, mapQboAccountType } from "./qbo.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
const eq = (got: unknown, want: unknown, msg: string) =>
  assert(Object.is(got, want), `${msg} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

Deno.test("currency scaling honours ISO-4217 exponent (F3)", () => {
  eq(qMinor("123.45", qFactor("USD")), 12345, "USD 2-decimal");
  eq(qMinor("1000", qFactor("JPY")), 1000, "JPY 0-decimal (×1)");
  eq(xMinor("1.234", xFactor("KWD")), 1234, "KWD 3-decimal (×1000)");
  eq(xFactor("ZZZ"), 100, "unknown currency defaults to 2-decimal");
  eq(xFactor("jpy"), 1, "currency code is case-insensitive");
  eq(xFactor(undefined), 100, "missing currency defaults to 2-decimal");
});

Deno.test("toMinor never throws or yields NaN on garbage", () => {
  for (const g of ["abc", "", "1,234.56"]) eq(qMinor(g, 100), 0, `garbage '${g}' → 0`);
  eq(qMinor(null as unknown as undefined, 100), 0, "null → 0");
  eq(qMinor(undefined, 100), 0, "undefined → 0");
  eq(qMinor(Infinity as unknown as number, 100), 0, "Infinity → 0");
  eq(qMinor(NaN as unknown as number, 100), 0, "NaN → 0");
  eq(qMinor("1e6", 100), 100000000, "scientific notation");
  eq(qMinor("-50.5", 100), -5050, "negative");
});

Deno.test("xeroDate parses, and never throws on out-of-range epochs (F8)", () => {
  eq(xeroDate("/Date(1612137600000+0000)/"), "2021-02-01", "/Date()/ epoch");
  eq(xeroDate("2023-07-15T00:00:00"), "2023-07-15", "ISO");
  eq(xeroDate("not a date"), null, "garbage → null");
  eq(xeroDate(""), null, "empty → null");
  eq(xeroDate(undefined), null, "undefined → null");
  // the F8 regression: a malformed huge epoch must return null, NOT throw
  eq(xeroDate("/Date(99999999999999999999)/"), null, "out-of-range epoch → null (no throw)");
});

Deno.test("account-type mapping defaults unknowns to expense", () => {
  eq(mapXeroAccountType("ASSET"), "asset", "xero ASSET");
  eq(mapXeroAccountType("WAT"), "expense", "xero unknown → expense");
  eq(mapXeroAccountType(null as unknown as string), "expense", "xero null → expense");
  eq(mapQboAccountType("Revenue"), "income", "qbo Revenue → income");
  eq(mapQboAccountType(""), "expense", "qbo empty → expense");
});
