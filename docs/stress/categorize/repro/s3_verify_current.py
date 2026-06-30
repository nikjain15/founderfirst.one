"""S3 — verify CURRENT (hardened) prod: recategorize concurrency now fixed?;
poisoning with merchant_key active; reverse_journal_entry concurrent double-reversal."""
import json, uuid, threading
from harness import save_manifest, mgmt_sql, rpc_sr, fn as efn
from lib import *

owner = make_user("ownerS3")
org = create_org(owner["jwt"], "[CATTEST] Biz S3")[1]["org"]["id"]
J = owner["jwt"]
cash = mk_account(J, org, "[CATTEST] Cash", "asset", "1000")
sw = mk_account(J, org, "[CATTEST] Software", "expense", "5100")
ml = mk_account(J, org, "[CATTEST] Meals", "expense", "5200")
tr = mk_account(J, org, "[CATTEST] Travel", "expense", "5300")
holding = materialize_holding(owner["id"], org)
def ok(n,c): print(f"  [{'PASS' if c else 'FAIL'}] {n}")

# ════ A: recategorize concurrency now serialized? ══════════════════════════════
print("\n=== A: recategorize concurrent double-categorize (expect FIXED now) ===")
worst = 0
for attempt in range(5):
    e = seed_uncat(J, org, holding, cash, f"Race3 {uuid.uuid4().hex[:6]}", 4200, "out", idem="s3a-"+uuid.uuid4().hex)
    targets=[sw,ml,tr]; outs=[None]*6
    def w(i): outs[i]=approve(J, org, e, targets[i%3])
    ts=[threading.Thread(target=w,args=(i,)) for i in range(6)]
    [t.start() for t in ts]; [t.join() for t in ts]
    nrev=int(mgmt_sql(f"select count(*) c from journal_entries where org_id='{org}' and reverses_id='{e}'")[1][0]["c"])
    nrepost=int(mgmt_sql(f"select count(*) c from journal_entries where org_id='{org}' and source='recategorize' and source_ref='{e}'")[1][0]["c"])
    worst=max(worst,nrev,nrepost)
    print(f"  attempt{attempt}: reversals={nrev} reposts={nrepost} statuses={[o[0] for o in outs]}")
ok(f"recategorize serialized (max rev/repost per entry = {worst}, want 1)", worst==1)

# ════ B: poisoning with merchant_key active ════════════════════════════════════
print("\n=== B: rule poisoning on CURRENT prod (merchant_key active) ===")
# B1 LIKE wildcard
e=seed_uncat(J,org,holding,cash,"a%z",1000,"out",idem="s3b1-"+uuid.uuid4().hex)
approve(J,org,e,ml,learn=True)
mk_val=mgmt_sql(f"select match_value from categorization_rules where org_id='{org}' and account_id='{ml}' order by created_at desc limit 1")[1]
match=mgmt_sql(f"select match_categorization_rule('{org}','alcatraz tickets') a")[1][0]["a"]
print(f"  learned match_value={mk_val}  matcher('alcatraz tickets')={match} meals={ml}")
ok("LIKE-wildcard poisoning still live (a%z matches alcatraz)", match==ml)
# B2 generic short memo
e=seed_uncat(J,org,holding,cash,"the",1000,"out",idem="s3b2-"+uuid.uuid4().hex)  # 'the' = common word, len 3
approve(J,org,e,tr,learn=True)
mk2=mgmt_sql(f"select match_value from categorization_rules where org_id='{org}' and account_id='{tr}' order by created_at desc limit 1")[1]
match2=mgmt_sql(f"select match_categorization_rule('{org}','Theatre tickets for the team') a")[1][0]["a"]
print(f"  learned match_value={mk2}  matcher('Theatre tickets for the team')={match2} travel={tr}")
ok("short/common-word poisoning still live ('the' over-matches)", match2==tr)
# B3 verify merchant_key DOES strip numbers (the part that IS fixed)
e=seed_uncat(J,org,holding,cash,"ADOBE *123456",1000,"out",idem="s3b3-"+uuid.uuid4().hex)
approve(J,org,e,sw,learn=True)
mk3=mgmt_sql(f"select match_value from categorization_rules where org_id='{org}' and account_id='{sw}' order by created_at desc limit 1")[1][0]["match_value"]
print(f"  merchant_key('ADOBE *123456') learned as '{mk3}' (numbers stripped → good)")

# ════ C: reverse_journal_entry concurrent double-reversal (ledger-reverse fn) ═══
print("\n=== C: reverse_journal_entry concurrent double-reversal (expect STILL BROKEN) ===")
worstR=0
for attempt in range(5):
    # post a normal balanced entry (sw debit / cash credit), then race two reverses
    idem="s3c-"+uuid.uuid4().hex
    ent=efn("ledger-entries",{"op":"post","org_id":org,"entry_date":"2026-05-10","idempotency_key":idem,
            "lines":[{"account_id":sw,"amount_minor":900,"side":"D"},{"account_id":cash,"amount_minor":900,"side":"C"}],
            "memo":f"RevRace {attempt}"},J)[1]["entry"]["id"]
    outs=[None]*6
    def wr(i):
        outs[i]=efn("ledger-reverse",{"org_id":org,"entry_id":ent,"idempotency_key":"rev-"+uuid.uuid4().hex,"memo":"x"},J)
    ts=[threading.Thread(target=wr,args=(i,)) for i in range(6)]
    [t.start() for t in ts]; [t.join() for t in ts]
    nrev=int(mgmt_sql(f"select count(*) c from journal_entries where org_id='{org}' and reverses_id='{ent}'")[1][0]["c"])
    worstR=max(worstR,nrev)
    swbal=mgmt_sql(f"select coalesce(sum(case when side='D' then amount_minor else -amount_minor end),0) b from journal_lines where org_id='{org}' and account_id='{sw}' and entry_id in (select id from journal_entries where reverses_id='{ent}' or id='{ent}')")[1][0]["b"]
    print(f"  attempt{attempt}: reversals={nrev} statuses={[o[0] for o in outs]} sw-net(orig+revs)={swbal}")
    if nrev>1: break
if worstR>1:
    print(f"  *** P0: reverse_journal_entry double-reversal — {worstR} reversals of one entry ***")
ok(f"reverse_journal_entry serialized (max reversals = {worstR}, want 1)", worstR==1)

print("\n=== integrity ===", trial_balance(org), "unbalanced", per_entry_balanced(org))
save_manifest()
