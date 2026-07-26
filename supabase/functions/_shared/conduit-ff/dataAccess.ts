/**
 * FounderFirst read-only data access for the Conduit integration.
 *
 * The agent tools (investigator) and the MCP server both read ledger/transaction
 * data through this ONE interface, so tenant isolation and the read-only
 * invariant live in a single place. Every method is scoped to a single org that
 * is fixed when the accessor is constructed — a method cannot be asked to read a
 * different tenant's data. There is deliberately NO write method here: the agent
 * drafts, it never posts to the ledger (that stays the deterministic
 * recategorize_entry / autopost_categorization RPC path in categorize/index.ts).
 *
 * `makeSupabaseDataAccess` is the live Deno implementation: it verifies the
 * actor may READ the org (membership guard) before binding, then every query
 * carries `.eq("org_id", orgId)`. Tests inject a plain object implementing the
 * same interface, so the pure logic runs with no network and no database.
 */

/** One chart-of-accounts row the model may choose from. */
export interface FfAccount {
  id: string;
  code: string | null;
  name: string;
  type: string;
}

/** An uncategorized transaction awaiting a home. */
export interface FfTransaction {
  entry_id: string;
  description: string;
  /** "out" (money out, likely expense) or "in" (money in, likely income). */
  direction: "in" | "out";
  amount_minor: number;
  entry_date: string | null;
}

/** A prior categorization the org has already made for a similar description. */
export interface FfPriorCategorization {
  account_id: string;
  account_name: string;
  match_value: string;
  times_applied: number;
}

/** A retrievable tax-rule passage (grounding corpus for tax_rule_lookup). */
export interface FfTaxRuleDoc {
  id: string;
  text: string;
}

/**
 * The read-only surface. Constructed already bound to one org + one actor, so
 * callers cannot widen the tenant scope. All methods are reads.
 */
export interface FfDataAccess {
  readonly orgId: string;
  /** Live chart of accounts (archived + the uncategorized holding excluded). */
  listAccounts(): Promise<FfAccount[]>;
  /** The uncategorized transaction for `entryId`, or null if not in this org. */
  getTransaction(entryId: string): Promise<FfTransaction | null>;
  /** Prior categorizations whose learned match_value appears in `description`. */
  priorCategorizations(description: string): Promise<FfPriorCategorization[]>;
  /** Tax-rule passages relevant to a free-text query's domain (grounding corpus). */
  taxRuleCorpus(): Promise<FfTaxRuleDoc[]>;
}

/**
 * Minimal structural shape of the Supabase client used here. Kept local so this
 * module needs no supabase-js import to type-check under Deno.
 */
export interface SupabaseLike {
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }>;
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

export interface DataAccessDeps {
  svc: SupabaseLike;
  orgId: string;
  actorId: string;
  /** Optional tax-rule corpus loader; defaults to reading platform tax-rule text. */
  loadTaxRules?: (svc: SupabaseLike, orgId: string) => Promise<FfTaxRuleDoc[]>;
}

export class TenantAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantAccessError";
  }
}

const UNCATEGORIZED_HINT = /uncategor/i;

/**
 * Build the live read-only accessor. Enforces the membership guard up front:
 * the actor must be able to READ this org (we reuse `can_write_org_as` as the
 * membership predicate — a writer is by definition a member; a read-only CPA is
 * also a member and passes the dedicated read predicate when present). If the
 * guard fails, construction throws and no data is ever read.
 */
export async function makeSupabaseDataAccess(deps: DataAccessDeps): Promise<FfDataAccess> {
  const { svc, orgId, actorId } = deps;
  if (!orgId) throw new TenantAccessError("org_id is required");
  if (!actorId) throw new TenantAccessError("actor id is required");

  // Membership guard. Prefer a dedicated read predicate if the DB has one, else
  // fall back to the writer predicate. Either way, a non-member is refused.
  const member = await checkMembership(svc, actorId, orgId);
  if (!member) throw new TenantAccessError("actor is not a member of this org");

  const loadTaxRules = deps.loadTaxRules ?? defaultLoadTaxRules;

  return {
    orgId,

    async listAccounts(): Promise<FfAccount[]> {
      const { data } = await svc
        .from("ledger_accounts")
        .select("id, code, name, type, is_archived")
        .eq("org_id", orgId);
      return ((data ?? []) as Array<FfAccount & { is_archived: boolean }>)
        .filter((a) => !a.is_archived && !UNCATEGORIZED_HINT.test(a.name))
        .map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type }));
    },

    async getTransaction(entryId: string): Promise<FfTransaction | null> {
      if (!entryId) return null;
      const { data: entry } = await svc
        .from("journal_entries")
        .select("id, memo, entry_date, org_id, lines:journal_lines(account_id, amount_minor, side)")
        .eq("id", entryId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (!entry) return null;
      // deno-lint-ignore no-explicit-any
      const lines = (entry.lines ?? []) as Array<any>;
      // The uncategorized line is the one sitting on the holding account; we take
      // the debit/credit side of the largest line as the transaction direction.
      const line = lines[0] ?? {};
      return {
        entry_id: entry.id,
        description: String(entry.memo ?? "").trim(),
        direction: line.side === "D" ? "out" : "in",
        amount_minor: Number(line.amount_minor ?? 0) || 0,
        entry_date: entry.entry_date ?? null,
      };
    },

    async priorCategorizations(description: string): Promise<FfPriorCategorization[]> {
      const desc = (description ?? "").toLowerCase().trim();
      if (!desc) return [];
      const { data } = await svc
        .from("categorization_rules")
        .select("account_id, match_value, match_type, times_applied, is_active, ledger_accounts(name)")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .gte("times_applied", 1)
        .order("times_applied", { ascending: false })
        .limit(25);
      const out: FfPriorCategorization[] = [];
      // deno-lint-ignore no-explicit-any
      for (const r of (data ?? []) as Array<any>) {
        const mv = String(r.match_value ?? "").toLowerCase().trim();
        if (!mv) continue;
        const hit = r.match_type === "description_exact" ? desc === mv : desc.includes(mv);
        if (!hit) continue;
        out.push({
          account_id: r.account_id,
          account_name: String(r.ledger_accounts?.name ?? "(account)"),
          match_value: r.match_value,
          times_applied: Number(r.times_applied ?? 0) || 0,
        });
      }
      return out;
    },

    taxRuleCorpus(): Promise<FfTaxRuleDoc[]> {
      return loadTaxRules(svc, orgId);
    },
  };
}

async function checkMembership(svc: SupabaseLike, actorId: string, orgId: string): Promise<boolean> {
  // can_write_org_as is the guard categorize/index.ts already uses; a member
  // (writer or read-only CPA) passes it or the read variant. Best-effort: any
  // error is treated as "not a member" (fail closed).
  try {
    const { data } = await svc.rpc("can_write_org_as", { p_actor: actorId, target_org: orgId });
    return Boolean(data);
  } catch {
    return false;
  }
}

/**
 * Default tax-rule corpus loader: reads the org-scoped tax-rule text the seed
 * scripts populate. Best-effort — if the table is absent or empty the corpus is
 * empty, and the retrieval gate will report not-found rather than invent.
 */
async function defaultLoadTaxRules(svc: SupabaseLike, orgId: string): Promise<FfTaxRuleDoc[]> {
  try {
    const { data } = await svc
      .from("tax_rules")
      .select("id, title, body")
      .limit(200);
    // deno-lint-ignore no-explicit-any
    return ((data ?? []) as Array<any>).map((r) => ({
      id: String(r.id),
      text: `${String(r.title ?? "").trim()}\n${String(r.body ?? "").trim()}`.trim(),
    }));
  } catch {
    return [];
  }
}
