-- W1.6 — Learned-rules management (delete path). WRITE-ONLY: the integrator
-- reviews + sequences the deploy; do NOT deploy from this branch.
--
-- Card W1.6 gives owner/full-access-CPA a way to see every categorization rule
-- Penny has learned and DELETE a bad one. There is no delete RPC today:
-- `categorization_rules` is client-readable (RLS cr_select via can_access_org)
-- but every write is denied to clients (cr_nowrite) and mutations flow through
-- SECURITY DEFINER functions granted ONLY to service_role — the ISOTEST P0
-- pattern (a p_actor-first SECDEF RPC must never be EXECUTE-able by anon /
-- authenticated, or the actor can be forged). This adds that missing function.
--
-- Design — SOFT delete, not a row drop:
--   * The matcher already filters `is_active` (match_categorization_rule), so
--     flipping is_active=false stops the rule proposing on the NEXT categorize
--     — that IS "Penny stops applying it" (the card's acceptance test).
--   * learn_categorization_rule re-activates on conflict, so a later genuine
--     correction can revive the same (org, match_type, match_value) — a hard
--     delete would silently resurrect with a fresh id and lose the audit thread.
--   * Append-only / auditable: we write a ledger_audit row (rule.delete) with
--     the actor + the rule's shape, mirroring how recategorize_entry logs.
--
-- CAT-F4 (LIKE-wildcard rule poisoning): this path stores/deletes by the exact
-- rule id — it NEVER interpolates match_value into a LIKE pattern — so the
-- ESCAPE hardening in match_categorization_rule (migration 20260630140000 /
-- reconcile 20260701200100) is untouched and stays authoritative. The management
-- UI likewise displays match_value as literal text and deletes by id, so a
-- poisoned `%`/`_`/`\` value can be listed and removed safely without ever being
-- evaluated as a pattern.

create or replace function deactivate_categorization_rule(
  p_actor uuid, p_org uuid, p_rule_id uuid
) returns categorization_rules
language plpgsql security definer set search_path = public as $$
declare v_rule categorization_rules;
begin
  -- Same gate as every other categorize write: only a member who can WRITE the
  -- org (owner or full-access CPA — read-only CPA fails here) may delete a rule.
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  -- Lock + org-scope the row so a deactivate can't race a concurrent learn that
  -- re-activates the same rule (the loser re-reads the deactivated state).
  select * into v_rule
    from categorization_rules
   where id = p_rule_id and org_id = p_org
   for update;
  if not found then
    raise exception 'not_found: rule % not in org %', p_rule_id, p_org using errcode = 'no_data_found';
  end if;

  update categorization_rules
     set is_active = false, updated_at = now()
   where id = p_rule_id and org_id = p_org
  returning * into v_rule;

  -- Auditable: who removed which learned rule, and its shape (never a secret).
  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'rule.delete', 'categorization_rule', v_rule.id,
            jsonb_build_object('match_type', v_rule.match_type,
                               'match_value', v_rule.match_value,
                               'account_id', v_rule.account_id,
                               'times_applied', v_rule.times_applied,
                               'source', v_rule.source));
  return v_rule;
end$$;

-- Never EXECUTE-able by anon/authenticated (p_actor-first SECDEF — ISOTEST P0):
-- the categorize edge fn calls it as service_role after checking can_write_org_as.
revoke all on function deactivate_categorization_rule(uuid, uuid, uuid) from public;
grant execute on function deactivate_categorization_rule(uuid, uuid, uuid) to service_role;
