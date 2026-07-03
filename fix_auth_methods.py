import json, subprocess, time

api_id = "g6d96iexi0"
new_auth_id = "uj9eyc"

def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.stderr and "error" in result.stderr.lower():
        print(f"  Error: {result.stderr[:150]}")
        return False
    return True

# Get all resources
output = subprocess.run(["aws", "apigateway", "get-resources", "--rest-api-id", api_id, "--query", "items[?resourceMethods]", "--output", "json"], capture_output=True, text=True)
resources = json.loads(output.stdout)

methods_updated = 0
for res in resources:
    resource_id = res["id"]
    path = res["path"]
    for method in res.get("resourceMethods", {}):
        if method == "OPTIONS":
            continue
        # Check current auth
        cmd = ["aws", "apigateway", "get-method", "--rest-api-id", api_id, "--resource-id", resource_id, "--http-method", method, "--query", "authorizationType", "--output", "text"]
        current_auth = subprocess.run(cmd, capture_output=True, text=True).stdout.strip()
        if current_auth != "COGNITO_USER_POOLS":
            result = subprocess.run(["aws", "apigateway", "update-method", "--rest-api-id", api_id, "--resource-id", resource_id, "--http-method", method, "--patch-operations", f"op=replace,path=/authorizationType,value=COGNITO_USER_POOLS", f"op=replace,path=/authorizerId,value={new_auth_id}"], capture_output=True, text=True)
            if result.stderr and "error" in result.stderr.lower():
                print(f"  Failed: {path} {method}: {result.stderr[:150]}")
            else:
                methods_updated += 1
                print(f"  Updated: {path} {method}")

print(f"\nUpdated {methods_updated} methods")

# Now deploy
print("\nDeploying...")
result = subprocess.run(["aws", "apigateway", "create-deployment", "--rest-api-id", api_id, "--stage-name", "v1"], capture_output=True, text=True)
if result.stderr and "error" in result.stderr.lower():
    print(f"Deploy failed: {result.stderr}")
else:
    deploy = json.loads(result.stdout)
    deploy_id = deploy["id"]
    subprocess.run(["aws", "apigateway", "update-stage", "--rest-api-id", api_id, "--stage-name", "v1", "--patch-operations", f"op=replace,path=/deploymentId,value={deploy_id}"], capture_output=True, text=True)
    print(f"Deployed: {deploy_id}")
