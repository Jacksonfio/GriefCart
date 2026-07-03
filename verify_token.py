import json, urllib.request, base64, subprocess, sys

cmd = 'aws cognito-idp initiate-auth --client-id 61ho55j2698boup2aq6j5gkhel --auth-flow USER_PASSWORD_AUTH --auth-parameters USERNAME=Jacksonfio,PASSWORD="Jacksonfio@942"'
result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
resp = json.loads(result.stdout)
token = resp['AuthenticationResult']['AccessToken']

parts = token.split('.')
def b64_decode(s):
    s = s + '=' * (4 - len(s) % 4)
    return json.loads(base64.urlsafe_b64decode(s))
    
headers = b64_decode(parts[0])
claims = b64_decode(parts[1])
print('Headers:', json.dumps(headers, indent=2))
print('Claims:', json.dumps(claims, indent=2))

user_pool_id = 'us-east-1_98uFET11T'
region = 'us-east-1'
jwks_url = f'https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json'
jwks = json.loads(urllib.request.urlopen(jwks_url).read())
print(f'JWKS keys count: {len(jwks["keys"])}')
print(f'Token kid: {headers["kid"]}')
print(f'JWKS kids: {[k["kid"] for k in jwks["keys"]]}')
