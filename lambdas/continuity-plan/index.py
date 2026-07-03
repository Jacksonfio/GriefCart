import json, os, time, uuid, boto3, urllib.request, urllib.error
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
secretsmanager = boto3.client("secretsmanager")

USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TRUSTED_TABLE = dynamodb.Table(os.environ["TRUSTED_PERSONS_TABLE"])
PLANS_TABLE = dynamodb.Table(os.environ["CONTINUITY_PLANS_TABLE"])

GEMINI_MODEL = "gemini-2.5-flash"
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "gemini").lower()


def call_llm(messages, system=None, max_tokens=3000, temperature=0.4, json_mode=False):
    if LLM_PROVIDER != "gemini":
        return ""
    resp = secretsmanager.get_secret_value(SecretId=os.environ["GEMINI_API_KEY_SECRET"])
    api_key = resp["SecretString"]
    body = {
        "contents": [{"parts": [{"text": m["content"]}]} for m in messages],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }
    if json_mode:
        body["generationConfig"]["response_mime_type"] = "application/json"
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

PLAN_PROMPT = """You are GriefCart's Continuity Plan Generator. Create a comprehensive emergency continuity plan.

Given user data, generate a plan covering:

1. IMMEDIATE ACTIONS (first 24-72 hours)
2. WEEK 1: Notifications, document gathering, legal steps
3. MONTH 1: Financial consolidation, bill management
4. MONTH 3: Asset transfer, insurance claims
5. ONGOING: Long-term management

For each phase, list specific actions, which trusted person handles what, and references to relevant documents.

Return as structured JSON with actionable steps."""

def generate_plan(user_id):
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

    doc_summary = "\n".join([f"- {d['fileName']} ({d['category']})" for d in docs])
    trusted_summary = "\n".join([f"- {t.get('name')} ({t.get('relationship')}) - {t.get('accessLevel')} access - {'verified' if t.get('verificationStatus') == 'verified' else 'pending'}" for t in trusted])

    prompt = f"""Generate a continuity plan for {user.get('email')}.

Documents ({len(docs)}):
{doc_summary}

Trusted Persons ({len(trusted)}):
{trusted_summary}

Return JSON:
{{
  "planId": "auto",
  "generatedAt": "...",
  "phases": [
    {{
      "phase": "immediate|week1|month1|month3|ongoing",
      "title": "...",
      "actions": [{{"action": "...", "assignedTo": "person name or 'self'", "priority": "critical|high|medium|low", "documentRefs": ["referenced document names"], "details": "..."}}]
    }}
  ],
  "criticalContacts": [{{"name": "...", "role": "...", "phone": "...", "email": "..."}}],
  "documentChecklist": ["all critical documents needed"],
  "institutionList": [{{"name": "...", "type": "bank|insurance|government|other", "contactInfo": "..."}}],
  "legalSteps": ["required legal actions"],
  "recommendations": ["additional suggestions"]
}}"""

    def extract_json(text):
        text = text.strip()
        if "```" in text:
            parts = text.split("```")
            text = parts[1] if len(parts) >= 2 else parts[0]
        if text.startswith("json"):
            text = text[4:]
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end >= 0:
            text = text[start:end+1]
        import re
        text = re.sub(r',\s*}', '}', text)
        text = re.sub(r',\s*]', ']', text)
        return text

    try:
        text = call_llm([{"role": "user", "content": prompt}], system=PLAN_PROMPT, max_tokens=8192, temperature=0.4, json_mode=True)
        plan_data = json.loads(extract_json(text))
    except Exception as e:
        raw = text[:500] if 'text' in locals() else "No output from LLM"
        return {"error": f"Failed to parse plan: {str(e)[:200]}. Raw: {raw}"}

    plan_id = str(uuid.uuid4())
    plan_data["planId"] = plan_id
    plan_data["userId"] = user_id
    plan_data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    plan_data["status"] = "complete"

    PLANS_TABLE.put_item(Item=plan_data)
    return plan_data

def lambda_handler(event, context):
    http = event.get("httpMethod", "GET")
    path = event.get("path", "")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    if http == "GET" and path == "/continuity-plan":
        resp = PLANS_TABLE.query(
            IndexName="userId-index",
            KeyConditionExpression="userId = :uid",
            Limit=1,
            ScanIndexForward=False,
            ExpressionAttributeValues={":uid": user_id},
        )
        plans = resp.get("Items", [])
        return respond(200, {"plan": plans[0] if plans else None})

    if http == "POST" and "/continuity-plan/generate" in path:
        plan = generate_plan(user_id)
        return respond(200, plan)

    return respond(404, {"error": "Not found"})

def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=str),
    }
