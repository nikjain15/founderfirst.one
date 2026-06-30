"""S2 — approve/recategorize integrity: idempotency, IDOR, archived, closed period,
already-categorized, and the headline CONCURRENCY double-categorize race."""
import json, uuid, threading
from harness import save_manifest, fn, rpc_sr, mgmt_sql
from lib import *

owner = make_user("ownerS2")
org = create_org(owner["jwt"], "[CATTEST] Biz S2")[1]["org"]["id"]
J = owner["jwt"]
cash = mk_account(J, org, "[CATTEST] Cash", "asset", "1000")
software = mk_account(J, org, "[CATTEST] Software", "expense", "5100")
meals = mk_account(J, org, "[CATTEST] Meals", "expense", "5200")
travel = mk_account(J, org, "[CATTEST] Travel", "expense", "5300")
archived = mk_account(J, org, "[CATTEST] Archived", "expense", "5900")
# archive it
fn("ledger-accounts", {"org_id": org, "id": archived, "name": "[CATTEST] Archived",
                       "type": "expense", "code": "5900", "archived": True}, J)
holding = materialize_holding(owner["id"], org)

# second org for IDOR
owner2 = make_user("ownerS2b")
org2 = create_org(owner2["jwt"], "[CATTEST] Biz S2b")[1]["org"]["id"]
foreign_acct = mk_account(owner2["jwt"], org2, "[CATTEST] Foreign", "expense", "5100")

def bal(a): return account_balance(org, a)
def ok(name, cond): print(f"  [{'PASS' if cond else 'FAIL'}] {name}")

# ════ S2a: idempotent replay (same entry+account twice) ════════════════════════
print("\n=== S2a: idempotent double-approve (same account) ===")
e = seed_uncat(J, org, holding, cash, "Idem vendor", 3000, "out", idem="s2a-"+uuid.uuid4().hex)
st1, a1 = approve(J, org, e, software)
st2, a2 = approve(J, org, e, software)   # replay
print(f"  approve#1={st1} approve#2={st2}")
nrev = mgmt_sql(f"select count(*) c from journal_entries where org_id='{org}' and reverses_id='{e}'")[1][0]["c"]
nrepost = mgmt_sql(f"select count(*) c from journal_entries where org_id='{org}' and source='recategorize' and memo='Idem vendor'")[1][0]["c"]
ok(f"exactly one reversal (got {nrev})", str(nrev)=="1")
ok(f"exactly one repost (got {nrepost})", str(nrepost)=="1")
ok(f"software bal == 3000 (got {bal(software)})", bal(software)==3000)

# ════ S2b: approve into ARCHIVED account → reject ══════════════════════════════
print("\n=== S2b: approve into archived account ===")
e = seed_uncat(J, org, holding, cash, "Archived target", 1000, "out", idem="s2b-"+uuid.uuid4().hex)
st, r = approve(J, org, e, archived)
ok(f"rejected (status={st}, body={str(r)[:80]})", st >= 400)
ok("entry still uncategorized", any(x["entry_id"]==e for x in list_uncat(J, org)[1]))

# ════ S2c: IDOR — approve into ANOTHER ORG's account ═══════════════════════════
print("\n=== S2c: IDOR approve into foreign-org account ===")
e = seed_uncat(J, org, holding, cash, "IDOR target", 1000, "out", idem="s2c-"+uuid.uuid4().hex)
st, r = approve(J, org, e, foreign_acct)
ok(f"rejected (status={st}, body={str(r)[:80]})", st >= 400)
ok("no line landed on foreign acct", account_balance(org2, foreign_acct)==0)

# ════ S2d: IDOR — outsider approves entry in org they can't write ═══════════════
print("\n=== S2d: outsider (owner2) approves an org1 entry ===")
e = seed_uncat(J, org, holding, cash, "Outsider", 1000, "out", idem="s2d-"+uuid.uuid4().hex)
st, r = approve(owner2["jwt"], org, e, software)
ok(f"forbidden (status={st}, body={str(r)[:80]})", st in (403,401))

# ════ S2e: closed period ═══════════════════════════════════════════════════════
print("\n=== S2e: approve an entry whose period is closed ===")
e = seed_uncat(J, org, holding, cash, "Closed period", 1000, "out", date="2026-01-10", idem="s2e-"+uuid.uuid4().hex)
# close Jan 2026 via ledger-periods
per = mgmt_sql(f"select id from accounting_periods where org_id='{org}' and period_start='2026-01-01'")[1]
if per:
    pid = per[0]["id"]
    stp, rp = fn("ledger-periods", {"org_id": org, "period_id": pid, "action": "close"}, J)
    print(f"  close period {stp}")
    st, r = approve(J, org, e, software)
    print(f"  approve in closed period: status={st} body={str(r)[:100]}")
    ok("rejected, books unchanged", st >= 400)
    ok("entry still uncategorized (no orphan reversal)", any(x["entry_id"]==e for x in list_uncat(J, org)[1]))
    norphan = mgmt_sql(f"select count(*) c from journal_entries where org_id='{org}' and reverses_id='{e}'")[1][0]["c"]
    ok(f"no orphaned reversal (got {norphan})", str(norphan)=="0")
else:
    print("  (no Jan period found)")

print("=== mid integrity ===", trial_balance(org), "unbalanced", per_entry_balanced(org))

# ════ S2f: CONCURRENCY — two approves, SAME entry, DIFFERENT accounts ══════════
print("\n=== S2f: concurrent double-categorize (headline) ===")
results = {}
def run_many(n=6):
    e = seed_uncat(J, org, holding, cash, f"Race {uuid.uuid4().hex[:6]}", 4200, "out", idem="s2f-"+uuid.uuid4().hex)
    targets = [software, meals, travel]
    outs = [None]*n
    def worker(i):
        outs[i] = approve(J, org, e, targets[i % len(targets)])
    ts = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for t in ts: t.start()
    for t in ts: t.join()
    nrev = mgmt_sql(f"select count(*) c from journal_entries where org_id='{org}' and reverses_id='{e}'")[1][0]["c"]
    nrepost = mgmt_sql(f"select count(*) c from journal_entries where org_id='{org}' and source='recategorize' and reverses_id is null and memo like 'Race%' and idempotency_key like '%' ")[1][0]["c"]
    # count reposts that reference THIS entry via source_ref
    nrepost2 = mgmt_sql(f"select count(*) c from journal_entries where org_id='{org}' and source='recategorize' and source_ref='{e}'")[1][0]["c"]
    statuses = [o[0] for o in outs]
    return e, nrev, nrepost2, statuses

for attempt in range(4):
    e, nrev, nrepost, statuses = run_many(6)
    holding_bal = account_balance(org, holding)
    print(f"  attempt{attempt}: reversals={nrev} reposts={nrepost} statuses={statuses}")
    if int(nrev) > 1 or int(nrepost) > 1:
        print(f"  *** DOUBLE-POST: entry={e} reversals={nrev} reposts={nrepost} ***")
        json.dump({"entry": e, "reversals": nrev, "reposts": nrepost, "org": org},
                  open("DOUBLEPOST.json","w"))
        break

print("=== final integrity ===")
print("  trial_balance", trial_balance(org))
print("  unbalanced_entries", per_entry_balanced(org))
print("  holding_bal (want 0 if all races resolved once)", account_balance(org, holding))
save_manifest()
