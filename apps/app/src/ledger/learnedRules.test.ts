/**
 * W1.6 learned-rules row normalization (REG W1.6-RULEDEL, client portion).
 * PostgREST returns an embedded to-one relation as an object, an array, or null
 * depending on the join — the list must flatten every shape to a single account
 * or null so the Rules table never crashes on `account.name`. Pure, node-env.
 */
import { describe, expect, it } from "vitest";
import { normalizeLearnedRule } from "./api";

const base = {
  id: "r1", match_type: "description_contains" as const, match_value: "starbucks",
  account_id: "a1", source: "penny", times_applied: 3, created_at: "2026-07-01T00:00:00Z",
};

describe("normalizeLearnedRule", () => {
  it("flattens an array-embedded account to a single object", () => {
    const r = normalizeLearnedRule({ ...base, account: [{ code: "5100", name: "Meals" }] });
    expect(r.account).toEqual({ code: "5100", name: "Meals" });
  });

  it("passes an object-embedded account through unchanged", () => {
    const r = normalizeLearnedRule({ ...base, account: { code: "5100", name: "Meals" } });
    expect(r.account).toEqual({ code: "5100", name: "Meals" });
  });

  it("maps a missing / empty account to null (no crash on account.name)", () => {
    expect(normalizeLearnedRule({ ...base, account: null }).account).toBeNull();
    expect(normalizeLearnedRule({ ...base, account: [] }).account).toBeNull();
  });

  it("preserves a literal LIKE-metacharacter match_value verbatim (CAT-F4: shown as text, never a pattern)", () => {
    const r = normalizeLearnedRule({ ...base, match_value: "a%z", account: null });
    expect(r.match_value).toBe("a%z");
  });
});
