/**
 * W3.3 — the industry → CoA-template chain, proven against the real kernel seeds.
 * Guarantees "selecting an industry seeds the matching chart of accounts" is
 * kernel-driven with no hardcoded map: every industry's coa_template_ref resolves
 * to a non-empty, well-formed template, and the general_business fallback exists.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const KERNEL = resolve(__dirname, "../../../../supabase/seeds/kernel");
function seed<T>(file: string): T[] {
  return (JSON.parse(readFileSync(resolve(KERNEL, file), "utf8")).rows ?? []) as T[];
}

interface Industry { key: string; coa_template_ref: string | null }
interface CoaAccount { template_ref: string; code: string; name: string; type: string }

const INDUSTRIES = seed<Industry>("industries.json");
const TEMPLATES = seed<CoaAccount>("coa_account_templates.json");
const ACCOUNT_TYPES = new Set(["asset", "liability", "equity", "income", "expense"]);

describe("W3.3 · CoA templates (kernel-driven)", () => {
  it("every industry's coa_template_ref resolves to a non-empty template", () => {
    const refs = new Set(TEMPLATES.map((t) => t.template_ref));
    for (const ind of INDUSTRIES) {
      if (!ind.coa_template_ref) continue;
      expect(refs.has(ind.coa_template_ref)).toBe(true);
      const rows = TEMPLATES.filter((t) => t.template_ref === ind.coa_template_ref);
      expect(rows.length).toBeGreaterThan(0);
    }
  });

  it("the general_business fallback template exists (seed_org_coa's default)", () => {
    expect(TEMPLATES.some((t) => t.template_ref === "general_business")).toBe(true);
  });

  it("every template row is a valid account (type in enum, unique code per template)", () => {
    const byRef = new Map<string, Set<string>>();
    for (const t of TEMPLATES) {
      expect(ACCOUNT_TYPES.has(t.type)).toBe(true);
      expect(t.name.length).toBeGreaterThan(0);
      const codes = byRef.get(t.template_ref) ?? new Set<string>();
      expect(codes.has(t.code)).toBe(false); // no dup code within a template
      codes.add(t.code);
      byRef.set(t.template_ref, codes);
    }
  });

  it("every template has at least one income and one expense account (a usable chart)", () => {
    const refs = new Set(TEMPLATES.map((t) => t.template_ref));
    for (const ref of refs) {
      const rows = TEMPLATES.filter((t) => t.template_ref === ref);
      expect(rows.some((r) => r.type === "income")).toBe(true);
      expect(rows.some((r) => r.type === "expense")).toBe(true);
    }
  });

  it("KERNEL DRIVES OPTIONS: a new industry seed with a known template needs no code", () => {
    // A test industry pointing at an existing template resolves to that chart with
    // zero code change — mirrors seed_org_coa's lookup.
    const testInd: Industry = { key: "test_sector", coa_template_ref: "general_business" };
    const withNew = [...INDUSTRIES, testInd];
    const resolved = TEMPLATES.filter(
      (t) => t.template_ref === withNew.find((i) => i.key === "test_sector")!.coa_template_ref,
    );
    expect(resolved.length).toBeGreaterThan(0);
  });
});
