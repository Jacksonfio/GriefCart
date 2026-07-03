import json, os, time, boto3, urllib.request, urllib.error
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
secretsmanager = boto3.client("secretsmanager")

USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TRUSTED_TABLE = dynamodb.Table(os.environ["TRUSTED_PERSONS_TABLE"])
PLANS_TABLE = dynamodb.Table(os.environ["CONTINUITY_PLANS_TABLE"])

GEMINI_MODEL = "gemini-2.5-flash"
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "gemini").lower()


def call_llm(messages, system=None, max_tokens=3000, temperature=0.5, json_mode=False):
    if LLM_PROVIDER != "gemini":
        return ""
    resp = secretsmanager.get_secret_value(SecretId=os.environ["GEMINI_API_KEY_SECRET"])
    api_key = resp["SecretString"]
    body = {
        "contents": [{"parts": [{"text": m["content"]}]} for m in messages],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    max_retries = 4
    resp_data = None
    for attempt in range(max_retries + 1):
        try:
            req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}",
                data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json"},
            )
            resp_data = json.loads(urllib.request.urlopen(req).read())
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            print(f"call_llm HTTPError: {e.code} {e.read().decode()[:200]}")
            return ""
    if not resp_data:
        print("call_llm: No response data after retries")
        return ""
    candidates = resp_data.get("candidates", [])
    if candidates:
        parts = candidates[0].get("content", {}).get("parts", [])
        if parts:
            return parts[0].get("text", "")
    return ""

def generate_recovery_guide(user_id):
    user_resp = USERS_TABLE.get_item(Key={"userId": user_id})
    user = user_resp.get("Item", {})

    docs_resp = DOCS_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        ExpressionAttributeValues={":uid": user_id},
    )
    docs = docs_resp.get("Items", [])

    trusted_resp = TRUSTED_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        ExpressionAttributeValues={":uid": user_id},
    )
    trusted = trusted_resp.get("Items", [])

    plan_resp = PLANS_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        ExpressionAttributeValues={":uid": user_id},
    )
    plans = plan_resp.get("Items", [])

    doc_summary = "\n".join([f"- {d['fileName']} ({d['category']})" for d in docs]) if docs else "No documents"
    trusted_summary = "\n".join([f"- {t.get('name')} ({t.get('relationship')}) - {t.get('accessLevel')} access" for t in trusted]) if trusted else "No trusted persons"

    prompt = f"""You are GriefCart's Recovery Assistant. Generate a step-by-step recovery guide.

User: {user.get('email', 'Unknown')}
Documents ({len(docs)}):
{doc_summary}

Trusted Persons ({len(trusted)}):
{trusted_summary}

Continuity Plan: {"Exists" if plans else "Not yet created"}

Write a compassionate, practical step-by-step recovery guide for the trusted persons. Assume the user is unavailable.

Structure:
1. First 24 hours - immediate steps for trusted persons
2. Contact list with instructions
3. Document retrieval guide (which documents to find, where they're stored)
4. Institution notification checklist
5. Professional services to engage (lawyer, accountant, etc.)
6. Long-term management plan

Write in clear, numbered steps. Be specific, practical, and compassionate."""

    try:
        guide = call_llm([{"role": "user", "content": prompt}], max_tokens=3000, temperature=0.5)
        if not guide:
            guide = "Recovery guide generation failed. Please ensure your documents and trusted persons are set up."
    except Exception:
        guide = "Recovery guide generation failed. Please ensure your documents and trusted persons are set up."

    return {
        "guide": guide,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "documentCount": len(docs),
        "trustedPersonCount": len(trusted),
        "hasPlan": len(plans) > 0,
    }

def lambda_handler(event, context):
    http = event.get("httpMethod", "GET")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    if http == "GET":
        guide = generate_recovery_guide(user_id)
        return respond(200, guide)

    return respond(404, {"error": "Not found"})

def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=str),
    }
