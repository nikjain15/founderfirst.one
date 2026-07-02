/**
 * CPA practice-queue client logic (card W1.4). The cross-client ranking + counts
 * are computed server-side (cpa_practice_queue / cpa_client_counts) and covered by
 * the SQL/REG scenarios; here we lock the client-side pieces: the age label and
 * the copy contract (every queue kind resolves to a label + a CTA, so no row can
 * render blank).
 */
import { describe, expect, it } from "vitest";
import { ageLabel, type QueueKind } from "./practiceQueue";
import { COPY } from "../copy";

describe("ageLabel", () => {
  it("renders minutes under an hour", () => {
    expect(ageLabel(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m");
  });
  it("renders hours under a day", () => {
    expect(ageLabel(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe("3h");
  });
  it("renders days", () => {
    expect(ageLabel(new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe("2d");
  });
  it("floors sub-minute ages to 1m (never blank/zero)", () => {
    expect(ageLabel(new Date().toISOString())).toBe("1m");
  });
  it("returns empty for an unparseable timestamp", () => {
    expect(ageLabel("not-a-date")).toBe("");
  });
});

describe("practice copy contract", () => {
  // Kinds the queue can emit — mirrors the RPC + the QueueKind union.
  const KINDS: QueueKind[] = [
    "pending_review", "uncategorized", "unreconciled", "flagged", "upcoming_close",
  ];

  it("every kind has a non-empty label", () => {
    for (const k of KINDS) {
      expect(COPY.practice.kind[k], k).toBeTruthy();
    }
  });

  it("every kind has a non-empty CTA (the ≤2-tap resolution)", () => {
    for (const k of KINDS) {
      expect(COPY.practice.cta[k], k).toBeTruthy();
    }
  });

  it("count/summary helpers pluralize", () => {
    expect(COPY.practice.itemsCount(1)).toBe("1 item");
    expect(COPY.practice.itemsCount(3)).toBe("3 items");
  });
});
