/**
 * PayoutUpload (W4.1) — unit tests for the two pieces most likely to silently
 * mislead the owner: (1) the preview split view-model (gross / fees / refunds /
 * net rows shown BEFORE posting) and (2) the idempotent re-upload UX (a duplicate
 * must read "already imported", never a fresh success). Pure, DB-free.
 */
import { describe, expect, it } from "vitest";
import { previewLines } from "./PayoutUpload";
import { parsePayoutCsv, type ParsedPayoutCsv } from "./payouts";
import { COPY } from "../copy";

function stripePreview(): ReturnType<typeof previewLines> {
  const csv: ParsedPayoutCsv = {
    headers: ["type", "amount", "fee"],
    rows: [
      ["charge", "100.00", "3.20"],
      ["refund", "10.00", "0"],
    ],
  };
  const parsed = parsePayoutCsv("stripe", "po_prev", "2026-07-01", "USD", csv);
  return previewLines(parsed);
}

describe("previewLines (the pre-post split preview)", () => {
  it("shows gross, fees, refunds and a net line the owner can read", () => {
    const lines = stripePreview();
    const labels = lines.map((l) => l.label);
    expect(labels).toContain(COPY.payouts.rowGross);
    expect(labels).toContain(COPY.payouts.rowFees);
    expect(labels).toContain(COPY.payouts.rowRefunds);
    expect(labels).toContain(COPY.payouts.rowNet);
  });

  it("marks fees and refunds as subtractions and the net as the total", () => {
    const lines = stripePreview();
    const fees = lines.find((l) => l.label === COPY.payouts.rowFees)!;
    const refunds = lines.find((l) => l.label === COPY.payouts.rowRefunds)!;
    const net = lines.find((l) => l.label === COPY.payouts.rowNet)!;
    expect(fees.kind).toBe("sub");
    expect(fees.value.startsWith("−")).toBe(true);
    expect(refunds.kind).toBe("sub");
    expect(net.kind).toBe("net");
    // gross 100 − fee 3.20 − refund 10 = 86.80
    expect(net.value).toContain("86.80");
  });

  it("omits fee/refund/adjustment rows that are zero (no noise)", () => {
    const csv: ParsedPayoutCsv = {
      headers: ["type", "amount", "fee"],
      rows: [["charge", "40.00", "0"]],
    };
    const lines = previewLines(parsePayoutCsv("stripe", "po_zero", "2026-07-01", "USD", csv));
    const labels = lines.map((l) => l.label);
    expect(labels).toContain(COPY.payouts.rowGross);
    expect(labels).not.toContain(COPY.payouts.rowFees);
    expect(labels).not.toContain(COPY.payouts.rowRefunds);
    expect(labels).not.toContain(COPY.payouts.rowAdjust);
    expect(labels).toContain(COPY.payouts.rowNet);
  });

  it("shows a signed other-adjustment row when present", () => {
    const csv: ParsedPayoutCsv = {
      headers: ["type", "amount", "fee"],
      rows: [
        ["charge", "100.00", "0"],
        ["adjustment", "-5.00", "0"],
      ],
    };
    const lines = previewLines(parsePayoutCsv("stripe", "po_adj", "2026-07-01", "USD", csv));
    const adj = lines.find((l) => l.label === COPY.payouts.rowAdjust);
    expect(adj).toBeTruthy();
    expect(adj!.value.startsWith("−")).toBe(true);
    expect(adj!.kind).toBe("sub");
    const net = lines.find((l) => l.label === COPY.payouts.rowNet)!;
    expect(net.value).toContain("95.00"); // 100 − 5 adjustment
  });
});

describe("idempotent re-upload UX copy", () => {
  // The edge fn returns duplicate:true when post_ecommerce_payout collides on the
  // ext:<provider>:payout:<id> key. The UI must speak "already imported", NOT a
  // fresh "recorded" success, so the owner knows nothing double-posted.
  it("has distinct copy for a first record vs. an already-imported re-upload", () => {
    expect(COPY.payouts.doneTitle).not.toBe(COPY.payouts.duplicateTitle);
    expect(COPY.payouts.duplicateBody.toLowerCase()).toContain("safe");
    expect(COPY.payouts.duplicateBody.toLowerCase()).toContain("recorded before");
  });

  // VOICE.md: owner-facing copy stays jargon-free (no debit/credit/journal-entry).
  it("keeps the payout copy owner-friendly (no accounting jargon)", () => {
    const surfaces = [
      COPY.payouts.lead, COPY.payouts.previewTitle, COPY.payouts.doneBody,
      COPY.payouts.rowGross, COPY.payouts.rowNet, COPY.payouts.reconcilesOk,
    ].join(" ").toLowerCase();
    expect(surfaces).not.toMatch(/\bdebit\b|\bcredit\b|journal entry/);
    // and no exclamation marks anywhere in the block (machine-enforced brand rule)
    const all = Object.values(COPY.payouts)
      .map((v) => (typeof v === "function" ? "" : String(v))).join(" ");
    expect(all).not.toContain("!");
  });
});
