import json, subprocess, urllib.request, urllib.error, time

cmd = 'aws cognito-idp initiate-auth --client-id 61ho55j2698boup2aq6j5gkhel --auth-flow USER_PASSWORD_AUTH --auth-parameters USERNAME=Jacksonfio,PASSWORD="Jacksonfio@942"'
result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
resp = json.loads(result.stdout)
id_token = resp['AuthenticationResult']['IdToken']
access_token = resp['AuthenticationResult']['AccessToken']

base = "https://g6d96iexi0.execute-api.us-east-1.amazonaws.com/v1"

# Wait for IAM propagation
print("Waiting for IAM propagation...")
time.sleep(5)

tests = [
    ("POST", "/twin/refresh", None),
    ("GET", "/continuity-score", None),
    ("POST", "/continuity-plan/generate", None),
    ("POST", "/detective/scan", None),
    ("GET", "/recovery", None),
    ("GET", "/detective/missing", None),
    ("GET", "/detective/subscriptions", None),
]

for method, path, body in tests:
    url = base + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {id_token}")
    req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        print(f"OK {method} {path}: {resp.status}")
        if resp.status == 200:
            resp_body = resp.read().decode()
            print(f"  Response: {resp_body[:150]}")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"FAIL {method} {path}: {e.code} - {error_body[:150]}")
    except Exception as ex:
        print(f"ERROR {method} {path}: {type(ex).__name__}: {str(ex)[:100]}")
