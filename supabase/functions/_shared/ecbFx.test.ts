/**
 * Deno-side pure tests for the ECB XML parser (W5.4-FX). No network — fixtures
 * only, mirroring the real feed's shape (double-quoted attrs) plus a
 * single-quoted variant to prove the lenient-quote parsing actually works.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isStale, latestAsOf, parseEcbXml, toFxRateRows } from "./ecbFx.ts";

const DAILY_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
	<Cube>
		<Cube time="2026-07-03">
			<Cube currency="USD" rate="1.0854"/>
			<Cube currency="JPY" rate="163.99"/>
			<Cube currency="GBP" rate="0.8567"/>
		</Cube>
	</Cube>
</gesmes:Envelope>`;

const HIST_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<Cube>
		<Cube time='2026-07-03'>
			<Cube currency='USD' rate='1.0854'/>
			<Cube currency='JPY' rate='163.99'/>
		</Cube>
		<Cube time='2026-07-02'>
			<Cube currency='USD' rate='1.0849'/>
			<Cube currency='JPY' rate='163.50'/>
		</Cube>
	</Cube>
</gesmes:Envelope>`;

Deno.test("parseEcbXml extracts a single-day snapshot (double-quoted attrs)", () => {
  const days = parseEcbXml(DAILY_FIXTURE);
  assertEquals(days.length, 1);
  assertEquals(days[0].asOf, "2026-07-03");
  assertEquals(days[0].rates.USD, 1.0854);
  assertEquals(days[0].rates.JPY, 163.99);
  assertEquals(days[0].rates.GBP, 0.8567);
});

Deno.test("parseEcbXml extracts multiple days in document order (single-quoted attrs)", () => {
  const days = parseEcbXml(HIST_FIXTURE);
  assertEquals(days.length, 2);
  assertEquals(days[0].asOf, "2026-07-03");
  assertEquals(days[1].asOf, "2026-07-02");
  assertEquals(days[1].rates.USD, 1.0849);
});

Deno.test("parseEcbXml returns empty on garbage input, never throws", () => {
  assertEquals(parseEcbXml("<not-ecb-xml/>").length, 0);
  assertEquals(parseEcbXml("").length, 0);
});

Deno.test("toFxRateRows drops currencies outside the active catalog and reports them", () => {
  const days = parseEcbXml(DAILY_FIXTURE);
  const { rows, skipped } = toFxRateRows(days, new Set(["USD", "GBP"]));
  assertEquals(rows.length, 2);
  assertEquals(rows.some((r) => r.quote_currency === "JPY"), false);
  assertEquals(skipped, ["JPY"]);
  const usdRow = rows.find((r) => r.quote_currency === "USD")!;
  assertEquals(usdRow.base_currency, "EUR");
  assertEquals(usdRow.as_of, "2026-07-03");
  assertEquals(usdRow.source, "ECB");
  assertEquals(usdRow.rate, 1.0854);
});

Deno.test("toFxRateRows honors a custom source label", () => {
  const days = parseEcbXml(DAILY_FIXTURE);
  const { rows } = toFxRateRows(days, new Set(["USD"]), "manual");
  assertEquals(rows[0].source, "manual");
});

Deno.test("toFxRateRows on an empty day list yields no rows and no skips", () => {
  const { rows, skipped } = toFxRateRows([], new Set(["USD"]));
  assertEquals(rows.length, 0);
  assertEquals(skipped.length, 0);
});

Deno.test("latestAsOf picks the max date regardless of input order", () => {
  assertEquals(latestAsOf(parseEcbXml(HIST_FIXTURE)), "2026-07-03");
  assertEquals(latestAsOf([]), null);
});

Deno.test("isStale: within the threshold is fresh, past it is stale, no data is always stale", () => {
  assertEquals(isStale("2026-07-03", "2026-07-04", 3), false); // 1 day old
  assertEquals(isStale("2026-07-03", "2026-07-07", 3), true); // 4 days old
  assertEquals(isStale("2026-07-03", "2026-07-06", 3), false); // exactly 3 days — not OVER threshold
  assertEquals(isStale(null, "2026-07-07", 3), true);
});
