import { describe, expect, it } from "vitest";
import { tableFetchState } from "./tableFetchState";

describe("tableFetchState (admin)", () => {
  it("is loading while the fetch is in flight, regardless of error/rowCount", () => {
    expect(tableFetchState(true, false, 0)).toBe("loading");
    expect(tableFetchState(true, true, 5)).toBe("loading");
  });

  it("is error once loading finishes with a failure — never falls through to empty", () => {
    expect(tableFetchState(false, true, 0)).toBe("error");
  });

  it("is empty only on a real zero-row success (no error)", () => {
    expect(tableFetchState(false, false, 0)).toBe("empty");
  });

  it("is rows when rows are present and there is no error", () => {
    expect(tableFetchState(false, false, 3)).toBe("rows");
  });
});
