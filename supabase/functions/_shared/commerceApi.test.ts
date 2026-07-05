/**
 * Deno-side mapping tests for commerceApi (Square + PayPal sandbox, read-only).
 * No network: only the pure classifiers/split are exercised. These must stay in
 * lockstep with apps/app/src/ecommerce/apiSync.test.ts (same fixtures, same
 * cents) — that is what makes the API path post the identical split as CSV, and
 * (via the shared native payout id upstream) collapse exactly-once.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { componentsOf, paypalRow, squareRow, type Row } from "./commerceApi.ts";

Deno.test("Square entries → split ties to the cent (charges + refund + adjustment)", () => {
  const rows: Row[] = [
    ...squareRow("CHARGE", 8800, -255),
    ...squareRow("CHARGE", 13025, -378),
    ...squareRow("REFUND", -3000, 87),
    ...squareRow("ADJUSTMENT", -100, 0),
    ...squareRow("DEPOSIT", -18179, 0), // dropped — the payout line
  ];
  const c = componentsOf(rows);
  assertEquals(c.gross, 8800 + 13025);
  assertEquals(c.fees, 255 + 378);
  assertEquals(c.refunds, 3000);
  assertEquals(c.adjust, 87 - 100);
  assertEquals(c.net, 18179);
});

Deno.test("Square DEPOSIT/transfer rows are never a component", () => {
  assertEquals(squareRow("DEPOSIT", -18179, 0).length, 0);
  assertEquals(squareRow("TRANSFER", 100, 0).length, 0);
});

Deno.test("PayPal event codes → split ties to the withdrawal net", () => {
  const rows: Row[] = [
    ...paypalRow("T0006", 5000, -180),
    ...paypalRow("T0006", 12000, -378),
    ...paypalRow("T1107", -2000, 70), // refund + fee credit-back
    ...paypalRow("T0400", -14512, 0), // withdrawal — dropped
  ];
  const c = componentsOf(rows);
  assertEquals(c.gross, 17000);
  assertEquals(c.fees, 558);
  assertEquals(c.refunds, 2000);
  assertEquals(c.adjust, 70);
  assertEquals(c.net, 14512); // == the withdrawal magnitude
});

Deno.test("PayPal withdrawal (T0400) is never a component", () => {
  assertEquals(paypalRow("T0400", -14512, 0).length, 0);
});
