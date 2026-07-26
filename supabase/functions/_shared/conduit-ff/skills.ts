/**
 * Intent-selected skills for the categorization investigator.
 *
 * Skills are declarative instruction modules, loaded at runtime by matching the
 * run context (goal + free-form context) — never by branching in the loop. Each
 * one shapes how the model investigates a KIND of transaction. The investigator
 * passes the transaction direction and description as `context`, so the expense
 * vs income skill loads by intent, and the tax-treatment skill loads when the
 * description hints at a treatment-sensitive category.
 */
import type { Skill } from "../conduit/agent/skill.ts";

const TAX_HINTS =
  /(meal|entertain|travel|mileage|vehicle|home office|depreciat|capital|asset|payroll|contractor|1099|donation|charit)/i;

export const investigatorSkills: Skill[] = [
  {
    id: "expense-investigation",
    whenIntent: (ctx) => /money out|expense|direction=out/i.test(`${ctx.goal} ${ctx.context ?? ""}`),
    instructions:
      "This is money OUT. Decide the expense account that best fits. Weigh prior " +
      "categorizations for this vendor most heavily (a repeated vendor is a strong " +
      "prior). Never pick an income account for money out.",
  },
  {
    id: "income-investigation",
    whenIntent: (ctx) => /money in|income|revenue|direction=in/i.test(`${ctx.goal} ${ctx.context ?? ""}`),
    instructions:
      "This is money IN. Decide the income/revenue account that best fits. Do not " +
      "pick an expense account for money in.",
  },
  {
    id: "tax-treatment",
    whenIntent: (ctx) => TAX_HINTS.test(`${ctx.goal} ${ctx.context ?? ""}`),
    instructions:
      "This description touches a treatment-sensitive category. Call tax_rule_lookup " +
      "before deciding, and only rely on a rule that was actually retrieved. If no " +
      "rule is found, do not invent one — fall back to the plain account match.",
  },
];
