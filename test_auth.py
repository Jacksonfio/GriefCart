import json, subprocess

cmd = 'aws cognito-idp initiate-auth --client-id 61ho55j2698boup2aq6j5gkhel --auth-flow USER_PASSWORD_AUTH --auth-parameters USERNAME=Jacksonfio,PASSWORD="Jacksonfio@942"'
result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
resp = json.loads(result.stdout)
token = resp['AuthenticationResult']['AccessToken']
print(f"Token: {token[:50]}...")

# Test authorizer
import subprocess
cmd = f'aws apigateway test-invoke-authorizer --rest-api-id g6d96iexi0 --authorizer-id aye93x --headers Authorization="Bearer {token}"'
result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
print("stdout:", result.stdout)
print("stderr:", result.stderr)
