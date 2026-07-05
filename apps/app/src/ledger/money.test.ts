/**
 * Money formatting/parsing must respect each currency's ISO-4217 minor-unit
 * precision (W5.4 design D2) — JPY/KRW/VND have NO minor unit, BHD/KWD/OMR
 * use 3dp, everything else defaults to 2dp. Getting this wrong either mangles
 * a JPY balance by 100x or silently truncates a BHD fils.
 */
import { describe, expect, it } from "vitest";
import { decimalToMinor, formatMoney, minorUnitFor, parseMoneyToMinor } from "./money";

describe("minorUnitFor", () => {
  it("defaults unknown/USD-like currencies to 2dp", () => {
    expect(minorUnitFor("USD")).toBe(2);
    expect(minorUnitFor("EUR")).toBe(2);
    expect(minorUnitFor("GBP")).toBe(2);
  });
  it("JPY/KRW/VND have zero minor-unit digits", () => {
    expect(minorUnitFor("JPY")).toBe(0);
    expect(minorUnitFor("KRW")).toBe(0);
    expect(minorUnitFor("VND")).toBe(0);
  });
  it("BHD/KWD/OMR use 3 minor-unit digits", () => {
    expect(minorUnitFor("BHD")).toBe(3);
    expect(minorUnitFor("KWD")).toBe(3);
    expect(minorUnitFor("OMR")).toBe(3);
  });
});

describe("decimalToMinor / parseMoneyToMinor — currency-aware precision", () => {
  it("USD (2dp): '12.50' -> 1250 minor units", () => {
    expect(decimalToMinor("12.50", 2)).toBe(1250);
    expect(parseMoneyToMinor("$1,234.50")).toBe(123450);
  });
  it("JPY (0dp): '500' -> 500 minor units (the yen IS the minor unit)", () => {
    expect(decimalToMinor("500", 0)).toBe(500);
  });
  it("JPY (0dp): a fractional yen is rejected, not silently rounded", () => {
    expect(decimalToMinor("500.5", 0)).toBeNull();
  });
  it("BHD (3dp): '12.500' -> 12500 minor units (fils)", () => {
    expect(decimalToMinor("12.500", 3)).toBe(12500);
    expect(decimalToMinor("12.5", 3)).toBe(12500); // short fraction pads, doesn't reject
  });
  it("BHD (3dp): a 4th fractional digit is rejected (sub-fils), not rounded", () => {
    expect(decimalToMinor("12.5001", 3)).toBeNull();
  });
});

describe("formatMoney — divides by the currency's own minor-unit scale", () => {
  it("USD divides by 100", () => {
    expect(formatMoney(123450, "USD")).toBe("$1,234.50");
  });
  it("JPY divides by 1 (whole yen), not by 100", () => {
    expect(formatMoney(500, "JPY")).toBe("¥500");
  });
  it("BHD divides by 1000 (3dp)", () => {
    // Intl inserts a NBSP (U+00A0) between an unrecognized-symbol currency
    // code and the number, not a regular space.
    expect(formatMoney(12500, "BHD")).toBe("BHD 12.500");
  });
});
