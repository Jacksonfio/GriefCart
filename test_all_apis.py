import json, subprocess, urllib.request, urllib.error, time

def get_id_token():
    cmd = 'aws cognito-idp initiate-auth --client-id 61ho55j2698boup2aq6j5gkhel --auth-flow USER_PASSWORD_AUTH --auth-parameters USERNAME=Jacksonfio,PASSWORD="Jacksonfio@942"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    resp = json.loads(result.stdout)
    return resp['AuthenticationResult']['IdToken']

token = get_id_token()
print(f"Got ID token: {token[:30]}...")
print()

base = "https://g6d96iexi0.execute-api.us-east-1.amazonaws.com/v1"

endpoints = [
    ("GET", "/documents", None, "List documents"),
    ("GET", "/twin", None, "Get financial twin"),
    ("POST", "/twin/query", {"question": "What is my net worth?"}, "Query twin"),
    ("POST", "/twin/refresh", None, "Refresh twin"),
    ("GET", "/continuity-score", None, "Continuity score"),
    ("GET", "/trusted-persons", None, "Trusted persons"),
    ("GET", "/continuity-plan", None, "Continuity plan"),
    ("POST", "/continuity-plan/generate", None, "Generate continuity plan"),
    ("POST", "/chat", {"message": "Hello", "history": []}, "Chat"),
    ("POST", "/detective/scan", None, "Detective scan"),
    ("GET", "/recovery", None, "Recovery guide"),
    ("GET", "/legacy", None, "Legacy answers"),
    ("POST", "/legacy/generate", {"legacyId": "test"}, "Generate legacy letter"),
    ("GET", "/detective/missing", None, "Detective missing"),
    ("GET", "/detective/subscriptions", None, "Detective subscriptions"),
    ("GET", "/audit", None, "Audit trail"),
]

for method, path, body, desc in endpoints:
    url = base + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        resp_body = resp.read().decode()
        status = resp.status
        if status == 200:
            print(f"[OK] {desc}: {status}")
        else:
            print(f"[{status}] {desc}: {resp_body[:100]}")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"[{e.code}] {desc}: {error_body[:100]}")
    except Exception as e:
        print(f"[ERR] {desc}: {type(e).__name__}: {str(e)[:100]}")
