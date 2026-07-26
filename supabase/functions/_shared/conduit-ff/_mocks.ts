/**
 * Test doubles for the Conduit integration. No network, no database — the model
 * provider is a scripted queue and the data access is a plain object. Used by the
 * *.test.ts files in this directory (run under Deno in the deno-tests CI gate).
 */
import type { ConduitClient, InferParams, InferResult } from "../conduit/client/types.ts";
import type {
  FfAccount,
  FfDataAccess,
  FfPriorCategorization,
  FfTaxRuleDoc,
  FfTransaction,
} from "./dataAccess.ts";

/** A model that replies with a scripted sequence of raw strings, one per turn. */
export function scriptedClient(outputs: string[]): { client: ConduitClient; calls: InferParams[] } {
  const calls: InferParams[] = [];
  let i = 0;
  const client: ConduitClient = {
    mode: "embedded",
    infer(params: InferParams): Promise<InferResult> {
      calls.push(params);
      const output = i < outputs.length ? outputs[i] : outputs[outputs.length - 1];
      i++;
      return Promise.resolve({
        output,
        model: "claude-haiku-4-5-20251001",
        provider: "anthropic",
        costUsd: 0,
        latencyMs: 1,
      });
    },
    retrieve: () => Promise.resolve({ chunks: [], grounded: false }),
    runAgent: () => Promise.reject(new Error("unused")),
    evaluate: () => Promise.reject(new Error("unused")),
    usage: () => Promise.reject(new Error("unused")),
  };
  return { client, calls };
}

export interface MockDataOptions {
  orgId?: string;
  accounts?: FfAccount[];
  transaction?: FfTransaction | null;
  priors?: FfPriorCategorization[];
  taxRules?: FfTaxRuleDoc[];
}

/** A read-only FfDataAccess backed by in-memory fixtures. */
export function mockDataAccess(opts: MockDataOptions = {}): FfDataAccess {
  return {
    orgId: opts.orgId ?? "org-1",
    listAccounts: () => Promise.resolve(opts.accounts ?? []),
    getTransaction: () => Promise.resolve(opts.transaction ?? null),
    priorCategorizations: () => Promise.resolve(opts.priors ?? []),
    taxRuleCorpus: () => Promise.resolve(opts.taxRules ?? []),
  };
}

export const SAMPLE_ACCOUNTS: FfAccount[] = [
  { id: "acc-software", code: "6100", name: "Software Subscriptions", type: "expense" },
  { id: "acc-meals", code: "6200", name: "Meals and Entertainment", type: "expense" },
  { id: "acc-revenue", code: "4000", name: "Product Revenue", type: "income" },
];
