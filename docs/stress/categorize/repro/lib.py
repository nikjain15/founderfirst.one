"""Setup + verification helpers built on harness.py."""
import json, uuid
from harness import (fn, create_org, make_user, rpc_sr, sql_select, mgmt_sql,
                     MANIFEST, save_manifest)

def mk_account(jwt, org, name, typ, code=None):
    st, j = fn("ledger-accounts", {"org_id": org, "name": name, "type": typ, "code": code}, jwt)
    assert st in (200, 201), f"acct {name}: {st} {j}"
    return j["account"]["id"]

def materialize_holding(owner_id, org):
    st, j = rpc_sr("resolve_uncategorized_account", {"p_actor": owner_id, "p_org": org})
    assert st == 200, f"holding: {st} {j}"
    return j  # uuid

def seed_uncat(jwt, org, holding, cash, memo, amount_minor, direction="out", date="2026-03-15", idem=None):
    """Post a manual entry with a line on the holding account (an uncategorized txn).
    direction 'out' = money out (holding debit / cash credit); 'in' = reverse."""
    idem = idem or f"cattest-seed-{uuid.uuid4().hex}"
    if direction == "out":
        lines = [{"account_id": holding, "amount_minor": amount_minor, "side": "D"},
                 {"account_id": cash, "amount_minor": amount_minor, "side": "C"}]
    else:
        lines = [{"account_id": cash, "amount_minor": amount_minor, "side": "D"},
                 {"account_id": holding, "amount_minor": amount_minor, "side": "C"}]
    st, j = fn("ledger-entries", {"op": "post", "org_id": org, "entry_date": date,
               "idempotency_key": idem, "lines": lines, "memo": memo, "source": "manual"}, jwt)
    assert st == 201, f"seed '{memo[:30]}': {st} {j}"
    return j["entry"]["id"]

def propose(jwt, org, entry):
    return fn("categorize", {"op": "propose", "org_id": org, "entry_id": entry}, jwt)

def approve(jwt, org, entry, to_account, learn=True, learn_value=None):
    body = {"op": "approve", "org_id": org, "entry_id": entry, "to_account_id": to_account, "learn": learn}
    if learn_value is not None:
        body["learn_value"] = learn_value
    return fn("categorize", {**body}, jwt)

def list_uncat(jwt, org):
    from harness import req, REST, ANON
    return req("POST", f"{REST}/rpc/list_uncategorized_entries",
               {"apikey": ANON, "Authorization": f"Bearer {jwt}"}, {"p_org": org})

# ── verification (service role, full visibility) ──────────────────────────────
def trial_balance(org):
    q = (f"select coalesce(sum(case when jl.side='D' then jl.amount_minor else 0 end),0) d, "
         f"coalesce(sum(case when jl.side='C' then jl.amount_minor else 0 end),0) c "
         f"from journal_lines jl join journal_entries je on je.id=jl.entry_id "
         f"where je.org_id='{org}'")
    st, j = mgmt_sql(q)
    return j[0] if st in (200,201) else j

def account_balance(org, account):
    q = (f"select coalesce(sum(case when side='D' then amount_minor else -amount_minor end),0) bal "
         f"from journal_lines where org_id='{org}' and account_id='{account}'")
    st, j = mgmt_sql(q)
    return j[0]["bal"] if st in (200,201) else j

def entries_for(org):
    q = (f"select id,memo,status,source,reverses_id from journal_entries where org_id='{org}' "
         f"order by created_at")
    st, j = mgmt_sql(q)
    return j

def rules_for(org):
    q = (f"select match_type,match_value,account_id,source,times_applied,is_active "
         f"from categorization_rules where org_id='{org}' order by created_at")
    st, j = mgmt_sql(q)
    return j

def audit_for(org):
    q = f"select action,target_id,detail->>'source' src,detail->>'status' status from ledger_audit where org_id='{org}' order by at"
    st, j = mgmt_sql(q)
    return j

def per_entry_balanced(org):
    """Return list of entries whose debits != credits (should be empty)."""
    q = (f"select je.id, sum(case when jl.side='D' then jl.amount_minor else 0 end) d, "
         f"sum(case when jl.side='C' then jl.amount_minor else 0 end) c "
         f"from journal_entries je join journal_lines jl on jl.entry_id=je.id "
         f"where je.org_id='{org}' group by je.id having "
         f"sum(case when jl.side='D' then jl.amount_minor else 0 end) <> "
         f"sum(case when jl.side='C' then jl.amount_minor else 0 end)")
    st, j = mgmt_sql(q)
    return j
