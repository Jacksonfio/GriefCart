import json, subprocess, base64, urllib.request, urllib.error

def get_token():
    cmd = 'aws cognito-idp initiate-auth --client-id 61ho55j2698boup2aq6j5gkhel --auth-flow USER_PASSWORD_AUTH --auth-parameters USERNAME=Jacksonfio,PASSWORD="Jacksonfio@942"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    resp = json.loads(result.stdout)
    return resp['AuthenticationResult']['AccessToken']

def get_id_token():
    cmd = 'aws cognito-idp initiate-auth --client-id 61ho55j2698boup2aq6j5gkhel --auth-flow USER_PASSWORD_AUTH --auth-parameters USERNAME=Jacksonfio,PASSWORD="Jacksonfio@942"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    resp = json.loads(result.stdout)
    return resp['AuthenticationResult']['IdToken']

token = get_token()
id_token = get_id_token()

url = "https://g6d96iexi0.execute-api.us-east-1.amazonaws.com/v1/documents"

def test_auth(desc, token):
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    try:
        resp = urllib.request.urlopen(req)
        print(f"{desc}: {resp.status}")
        return True
    except urllib.error.HTTPError as e:
        print(f"{desc}: {e.code}")
        return False

test_auth("Access token (no aud)", token)
test_auth("ID token (has aud)", id_token)
