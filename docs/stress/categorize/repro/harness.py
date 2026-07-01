"""
[CATTEST] adversarial harness for Penny categorization + recategorize loop.
Talks to PROD (ref ejqsfzggyfsjzrcevlnq). Namespaced; creates only its own
fixtures; records every created id to manifest.json for cleanup.
"""
import json, os, time, urllib.request, urllib.error, uuid, threading

REF = "ejqsfzggyfsjzrcevlnq"
URL = f"https://{REF}.supabase.co"
REST = f"{URL}/rest/v1"
AUTH = f"{URL}/auth/v1"
FN = f"{URL}/functions/v1"
MGMT = "https://api.supabase.com"
HERE = os.path.dirname(os.path.abspath(__file__))

def _env():
    e = {}
    with open(os.path.expanduser("~/.config/founderfirst/secrets.env")) as f:
        for ln in f:
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, v = ln.split("=", 1)
                e[k] = v.strip().strip('"').strip("'")
    return e
ENV = _env()
SR = ENV["SUPABASE_SERVICE_ROLE_KEY"]
ACCESS = ENV["SUPABASE_ACCESS_TOKEN"]
ANON = open(os.path.join(HERE, ".anon")).read().strip()
UA = "ff-stress-cattest/1.0"

MANIFEST_PATH = os.path.join(HERE, "manifest.json")
def _load_manifest():
    if os.path.exists(MANIFEST_PATH):
        return json.load(open(MANIFEST_PATH))
    return {"users": [], "orgs": [], "note": "[CATTEST] fixtures on PROD"}
MANIFEST = _load_manifest()
def save_manifest():
    json.dump(MANIFEST, open(MANIFEST_PATH, "w"), indent=2)

def req(method, url, headers=None, body=None, raw=False):
    data = None
    if body is not None:
        data = json.dumps(body).encode()
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("User-Agent", UA)
    r.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            txt = resp.read().decode()
            return resp.status, (txt if raw else (json.loads(txt) if txt else None))
    except urllib.error.HTTPError as ex:
        txt = ex.read().decode()
        try:
            return ex.code, json.loads(txt)
        except Exception:
            return ex.code, txt

# ── service-role REST (bypasses RLS) ──────────────────────────────────────────
def sql_select(path):
    """PostgREST query under service role. path e.g. 'journal_lines?entry_id=eq.X&select=*'"""
    return req("GET", f"{REST}/{path}", {"apikey": SR, "Authorization": f"Bearer {SR}"})

def rpc_sr(fn, args):
    return req("POST", f"{REST}/rpc/{fn}", {"apikey": SR, "Authorization": f"Bearer {SR}"}, args)

# ── Management API: run arbitrary SQL (read/inspect) ───────────────────────────
def mgmt_sql(query):
    return req("POST", f"{MGMT}/v1/projects/{REF}/database/query",
               {"Authorization": f"Bearer {ACCESS}"}, {"query": query})

# ── auth: create a user + password sign-in → user JWT ─────────────────────────
def make_user(tag):
    email = f"{tag}-{uuid.uuid4().hex[:8]}@cattest.founderfirst.test"
    pw = "Cattest!" + uuid.uuid4().hex[:12]
    st, j = req("POST", f"{AUTH}/admin/users",
                {"apikey": SR, "Authorization": f"Bearer {SR}"},
                {"email": email, "password": pw, "email_confirm": True})
    assert st in (200, 201), f"create user {st}: {j}"
    uid = j["id"]
    MANIFEST["users"].append({"id": uid, "email": email}); save_manifest()
    st, j = req("POST", f"{AUTH}/token?grant_type=password",
                {"apikey": ANON}, {"email": email, "password": pw})
    assert st == 200, f"signin {st}: {j}"
    return {"id": uid, "email": email, "jwt": j["access_token"]}

# ── edge function call as a user ──────────────────────────────────────────────
def fn(name, body, jwt):
    return req("POST", f"{FN}/{name}",
               {"apikey": ANON, "Authorization": f"Bearer {jwt}"}, body)

# ── orgs edge fn: create a business org (returns org id) ──────────────────────
def create_org(jwt, name):
    st, j = fn("orgs", {"op": "create", "type": "business", "name": name}, jwt)
    return st, j

if __name__ == "__main__":
    print("env ok; SR len", len(SR), "ANON len", len(ANON), "ACCESS len", len(ACCESS))
    st, j = mgmt_sql("select 1 as ping")
    print("mgmt ping", st, j)
