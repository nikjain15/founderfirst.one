"""S7 — CPA review/feedback loop: read_only blocked; full-CPA under approval-required
categorize → does the transaction temporarily vanish from posted books?"""
import json, uuid
from harness import save_manifest, rpc_sr, mgmt_sql, req, REST, SR
from lib import *

# client business org (owner)
owner = make_user("ownerS7")
client = create_org(owner["jwt"], "[CATTEST] Client S7")[1]["org"]["id"]
J = owner["jwt"]
cash = mk_account(J, client, "[CATTEST] Cash", "asset", "1000")
software = mk_account(J, client, "[CATTEST] Software", "expense", "5100")
holding = materialize_holding(owner["id"], client)

def set_require_approval(org, val):
    # service-role update of org_accounting_settings
    return req("PATCH", f"{REST}/org_accounting_settings?org_id=eq.{org}",
               {"apikey": SR, "Authorization": f"Bearer {SR}", "Prefer": "return=representation"},
               {"cpa_posts_require_approval": val})

def make_engagement(firm, client, access, cpa_id, owner_id):
    st, j = req("POST", f"{REST}/engagements",
                {"apikey": SR, "Authorization": f"Bearer {SR}", "Prefer": "return=representation"},
                {"firm_org_id": firm, "client_org_id": client, "access": access,
                 "status": "active", "initiated_by": cpa_id})
    return st, j

# ── read_only CPA ──────────────────────────────────────────────────────────────
print("=== S7a: read_only CPA blocked ===")
cpaR = make_user("cpaRO")
firmR = create_org(cpaR["jwt"], "[CATTEST] Firm RO")[1]["org"]["id"]  # cpaR is firm_admin
st, eng = make_engagement(firmR, client, "read_only", cpaR["id"], owner["id"])
print("  engagement read_only:", st, str(eng)[:80])
e = seed_uncat(J, client, holding, cash, "RO test", 1500, "out", idem="s7a-"+uuid.uuid4().hex)
stp, p = propose(cpaR["jwt"], client, e)
print(f"  read_only propose → {stp} {str(p)[:80]}")
sta, a = approve(cpaR["jwt"], client, e, software)
print(f"  read_only approve → {sta} {str(a)[:80]}")
print(f"  [{'PASS' if stp==403 and sta==403 else 'FAIL'}] read_only blocked server-side (propose={stp} approve={sta})")
print(f"  [{'PASS' if any(x['entry_id']==e for x in list_uncat(J,client)[1]) else 'FAIL'}] entry untouched")

# ── full CPA under approval-required ──────────────────────────────────────────
print("\n=== S7b: full CPA + cpa_posts_require_approval categorizes ===")
print("  set require_approval:", set_require_approval(client, True)[0])
cpaF = make_user("cpaFull")
firmF = create_org(cpaF["jwt"], "[CATTEST] Firm Full")[1]["org"]["id"]
st, eng = make_engagement(firmF, client, "full", cpaF["id"], owner["id"])
print("  engagement full:", st)
e = seed_uncat(J, client, holding, cash, "CPA categorize", 2000, "out", date="2026-04-10", idem="s7b-"+uuid.uuid4().hex)
print("  bank/holding before:", account_balance(client,cash), account_balance(client,holding))
sta, a = approve(cpaF["jwt"], client, e, software)
print(f"  CPA approve → {sta} {str(a)[:120]}")
# inspect resulting entries
print("  entries after CPA categorize:")
for r in mgmt_sql(f"select source,status,memo,posted_by from journal_entries where org_id='{client}' and (source_ref='{e}' or id='{e}') order by created_at")[1]:
    print("   ", r)
# POSTED-only view (what reports see): is the transaction value present?
posted_software = mgmt_sql(f"select coalesce(sum(case when jl.side='D' then amount_minor else -amount_minor end),0) b from journal_lines jl join journal_entries je on je.id=jl.entry_id where je.org_id='{client}' and je.status='posted' and jl.account_id='{software}'")[1][0]["b"]
posted_holding = mgmt_sql(f"select coalesce(sum(case when jl.side='D' then amount_minor else -amount_minor end),0) b from journal_lines jl join journal_entries je on je.id=jl.entry_id where je.org_id='{client}' and je.status='posted' and jl.account_id='{holding}'")[1][0]["b"]
print(f"  POSTED software bal = {posted_software} (expect 2000 if categorize is live)")
print(f"  POSTED holding bal  = {posted_holding} (0 means txn removed from holding)")
print(f"  on uncat queue still? {any(x['entry_id']==e for x in list_uncat(J,client)[1])}")
# Is the expense visible anywhere posted? if software=0 AND holding=0 → VANISHED
vanished = posted_software=="0" and posted_holding=="0"
print(f"  >>> transaction VANISHED from posted books pending approval: {vanished}")
# owner approves the pending repost
pend = mgmt_sql(f"select id from journal_entries where org_id='{client}' and source='recategorize' and status='pending_review' and source_ref='{e}'")[1]
if pend:
    pid = pend[0]["id"]
    from harness import fn as efn
    stx, rx = efn("ledger-entries", {"op":"approve","org_id":client,"entry_id":pid}, J)
    print(f"  owner approves repost {pid} → {stx}")
    print(f"  POSTED software after owner-approve = {account_balance(client,software)}")
print("=== integrity ===", trial_balance(client), "unbalanced", per_entry_balanced(client))
save_manifest()
