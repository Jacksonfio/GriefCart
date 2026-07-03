import json, subprocess, time

api_id = "g6d96iexi0"
region = "us-east-1"
user_pool_id = "us-east-1_98uFET11T"

def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    stderr_lower = result.stderr.lower()
    if stderr_lower and ("error" in stderr_lower or "unexpected" in stderr_lower or "usage:" in stderr_lower):
        print(f"Error running {' '.join(args[:4])}: {result.stderr[:200]}")
        return None
    return result.stdout.strip()

# Step 1: Get all resources
print("Listing resources...")
output = run(["aws", "apigateway", "get-resources", "--rest-api-id", api_id, "--query", "items[?resourceMethods]", "--output", "json"])
if not output:
    print("Failed to get resources")
    exit(1)
resources = json.loads(output)

methods_to_update = []
for res in resources:
    resource_id = res["id"]
    path = res["path"]
    for method in res.get("resourceMethods", {}):
        if method == "OPTIONS":
            continue
        cmd = ["aws", "apigateway", "get-method", "--rest-api-id", api_id, "--resource-id", resource_id, "--http-method", method, "--query", "authorizerId", "--output", "text"]
        auth_id = run(cmd)
        if auth_id == "aye93x":
            methods_to_update.append((resource_id, path, method))
            print(f"Found: {path} {method} -> {auth_id}")

print(f"\nTotal methods to update: {len(methods_to_update)}")

# Step 2: Detach old authorizer from all methods (set to NONE temporarily)
print("\nDetaching old authorizer...")
for resource_id, path, method in methods_to_update:
    result = subprocess.run(["aws", "apigateway", "update-method", "--rest-api-id", api_id, "--resource-id", resource_id, "--http-method", method, "--patch-operations", f"op=replace,path=/authorizationType,value=NONE"], capture_output=True, text=True)
    if result.stderr and "error" in result.stderr.lower():
        print(f"  Failed to detach from {path} {method}: {result.stderr.strip()[:100]}")
    else:
        print(f"  Detached: {path} {method}")

# Step 3: Delete old authorizer
print("\nDeleting old authorizer...")
result = subprocess.run(["aws", "apigateway", "delete-authorizer", "--rest-api-id", api_id, "--authorizer-id", "aye93x"], capture_output=True, text=True)
if result.stderr and "error" in result.stderr.lower():
    print(f"  Failed to delete: {result.stderr.strip()[:200]}")
else:
    print("  Deleted authorizer aye93x")

# Step 4: Create new authorizer
print("\nCreating new authorizer...")
provider_arn = f"arn:aws:cognito-idp:{region}:{subprocess.check_output(['aws', 'sts', 'get-caller-identity', '--query', 'Account', '--output', 'text']).decode().strip()}:userpool/{user_pool_id}"
result = subprocess.run(["aws", "apigateway", "create-authorizer", "--rest-api-id", api_id, "--name", "CognitoAuthorizer", "--type", "COGNITO_USER_POOLS", "--provider-arns", provider_arn, "--identity-source", "method.request.header.Authorization"], capture_output=True, text=True)
if result.stderr and "error" in result.stderr.lower():
    print(f"  Failed to create: {result.stderr.strip()[:200]}")
    exit(1)
else:
    new_auth = json.loads(result.stdout)
    new_auth_id = new_auth["id"]
    print(f"  Created new authorizer: {new_auth_id}")

    # Step 5: Reattach new authorizer to all methods
    print("\nReattaching new authorizer...")
    for resource_id, path, method in methods_to_update:
        subprocess.run(["aws", "apigateway", "update-method", "--rest-api-id", api_id, "--resource-id", resource_id, "--http-method", method, "--patch-operations", f"op=replace,path=/authorizationType,value=COGNITO_USER_POOLS"], capture_output=True, text=True)
        subprocess.run(["aws", "apigateway", "update-method", "--rest-api-id", api_id, "--resource-id", resource_id, "--http-method", method, "--patch-operations", f"op=replace,path=/authorizerId,value={new_auth_id}"], capture_output=True, text=True)
        print(f"  Reattached: {path} {method}")

    # Step 6: Deploy
    print("\nDeploying...")
    result = subprocess.run(["aws", "apigateway", "create-deployment", "--rest-api-id", api_id, "--stage-name", "v1"], capture_output=True, text=True)
    if result.stderr and "error" in result.stderr.lower():
        print(f"  Deploy failed: {result.stderr.strip()[:200]}")
    else:
        deploy = json.loads(result.stdout)
        deploy_id = deploy["id"]
        subprocess.run(["aws", "apigateway", "update-stage", "--rest-api-id", api_id, "--stage-name", "v1", "--patch-operations", f"op=replace,path=/deploymentId,value={deploy_id}"], capture_output=True, text=True)
        print(f"  Deployed: {deploy_id}")

print("\nDone!")
