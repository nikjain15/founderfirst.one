"""S9 — verify the NEW finding from validator: approve_journal_entry concurrent
double-approve race (unlocked SELECT + unconditional UPDATE). Also re-run S8d clean."""
import json, uuid, threading
from harness import make_user, mgmt_sql, rpc_sr, fn as efn, req, REST, SR, AUTH, ANON
from lib import *
def ok(n,c): print(f"  [{'PASS' if c else 'FAIL'}] {n}")

# ── build a client with a full CPA under cpa_posts_require_approval ────────────
owner = make_user("ownerS9")
client = create_org(owner["jwt"], "[CATTEST] Client S9")[1]["org"]["id"]
J = owner["jwt"]
cash = mk_account(J, client, "[CATTEST] Cash", "asset", "1000")
sw   = mk_account(J, client, "[CATTEST] Software", "expense", "5100")
req("PATCH", f"{REST}/org_accounting_settings?org_id=eq.{client}",
    {"apikey":SR,"Authorization":f"Bearer {SR}","Prefer":"return=representation"},
    {"cpa_posts_require_approval": True})
cpa = make_user("cpaS9")
firm = create_org(cpa["jwt"], "[CATTEST] Firm S9")[1]["org"]["id"]
eng = req("POST", f"{REST}/engagements",
          {"apikey":SR,"Authorization":f"Bearer {SR}","Prefer":"return=representation"},
          {"firm_org_id":firm,"client_org_id":client,"access":"full","status":"active","initiated_by":cpa["id"]})[1][0]
req("POST", f"{REST}/client_assignments",
    {"apikey":SR,"Authorization":f"Bearer {SR}"},
    {"engagement_id":eng["id"],"user_id":cpa["id"],"assigned_by":cpa["id"]})
print("can_write CPA:", mgmt_sql(f"select can_write_org_as('{cpa['id']}','{client}') w")[1][0]["w"])

# ════ S9a: CPA posts a NORMAL entry → pending_review → excluded from reports ════
print("\n=== S9a: CPA pending post excluded from reports until owner-approve ===")
idem="s9a-"+uuid.uuid4().hex
ent=efn("ledger-entries",{"op":"post","org_id":client,"entry_date":"2026-05-01","idempotency_key":idem,
        "lines":[{"account_id":sw,"amount_minor":500,"side":"D"},{"account_id":cash,"amount_minor":500,"side":"C"}],
        "memo":"CPA pending"},cpa["jwt"])[1]["entry"]
ok("CPA post lands pending_review", ent["status"]=="pending_review")
posted_sw=lambda: int(mgmt_sql(f"select coalesce(sum(case when jl.side='D' then amount_minor else -amount_minor end),0) b from journal_lines jl join journal_entries je on je.id=jl.entry_id where je.org_id='{client}' and je.status='posted' and jl.account_id='{sw}'")[1][0]["b"])
ok(f"pending entry NOT in posted reports (sw posted={posted_sw()})", posted_sw()==0)

# ════ S9b: CONCURRENT owner-approve of the SAME pending entry ═══════════════════
print("\n=== S9b: concurrent double owner-approve (validator's P1) ===")
worst=0
for attempt in range(5):
    # fresh pending entry each round
    idem="s9b-"+uuid.uuid4().hex
    e=efn("ledger-entries",{"op":"post","org_id":client,"entry_date":"2026-05-02","idempotency_key":idem,
          "lines":[{"account_id":sw,"amount_minor":700,"side":"D"},{"account_id":cash,"amount_minor":700,"side":"C"}],
          "memo":f"pending {attempt}"},cpa["jwt"])[1]["entry"]["id"]
    outs=[None]*6
    def w(i): outs[i]=efn("ledger-entries",{"op":"approve","org_id":client,"entry_id":e},J)
    ts=[threading.Thread(target=w,args=(i,)) for i in range(6)]
    [t.start() for t in ts]; [t.join() for t in ts]
    n_ok=sum(1 for o in outs if o[0]==200)
    statuses=[o[0] for o in outs]
    worst=max(worst,n_ok)
    print(f"  attempt{attempt}: {n_ok} approves returned 200; statuses={statuses}")
# In a correct system exactly ONE approve should win; the rest should 'not_pending'.
ok(f"exactly one approve wins, rest rejected (max 200s seen = {worst}; want 1)", worst==1)

# ════ S8d redo: multi-line entry recategorize (clean int math) ══════════════════
print("\n=== S8d redo: multi-line recategorize ===")
o2=make_user("ownerS9b"); org2=create_org(o2["jwt"],"[CATTEST] Biz S9b")[1]["org"]["id"]
J2=o2["jwt"]
c2=mk_account(J2,org2,"[CATTEST] Cash","asset","1000"); s2=mk_account(J2,org2,"[CATTEST] Software","expense","5100")
f2=mk_account(J2,org2,"[CATTEST] Fees","expense","5400"); h2=materialize_holding(o2["id"],org2)
idem="s8d2-"+uuid.uuid4().hex
ent=efn("ledger-entries",{"op":"post","org_id":org2,"entry_date":"2026-05-20","idempotency_key":idem,
    "lines":[{"account_id":h2,"amount_minor":1000,"side":"D"},{"account_id":f2,"amount_minor":200,"side":"D"},
             {"account_id":c2,"amount_minor":1200,"side":"C"}],"memo":"split charge"},J2)[1]["entry"]["id"]
sw_b=account_balance(org2,s2); fees_b=account_balance(org2,f2)
approve(J2,org2,ent,s2)
ok("only holding line moved to Software (+1000)", account_balance(org2,s2)-sw_b==1000)
ok("known fee line untouched", account_balance(org2,f2)==fees_b)
ok("holding nets 0", account_balance(org2,h2)==0)
ok("all entries balanced", per_entry_balanced(org2)==[])
print("trial balance org2:", trial_balance(org2))
