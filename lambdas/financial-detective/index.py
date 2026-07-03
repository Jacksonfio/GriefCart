import json, os, time, boto3, urllib.request, urllib.error
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")
secretsmanager = boto3.client("secretsmanager")

USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TWIN_TABLE = dynamodb.Table(os.environ["FINANCIAL_TWIN_TABLE"])

GEMINI_MODEL = "gemini-2.5-flash"
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "gemini").lower()


def call_llm(messages, system=None, max_tokens=8192, temperature=0.4, json_mode=False):
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

DETECTIVE_PROMPT = """You are the GriefCart AI Financial Detective. Your job is to find what's missing.

Given a user's financial documents and their current Financial Twin, identify:

1. MISSING ASSETS - Common financial assets users forget to declare:
   - Life insurance policies
   - Retirement accounts (401k, IRA, pension)
   - Safe deposit boxes
   - Digital assets (crypto, NFTs, domain names)
   - Timeshares or vacation properties
   - Business interests or partnerships
   - Trust accounts
   - Prepaid funeral plans
   - Unclaimed property

2. HIDDEN SUBSCRIPTIONS - Recurring charges that may be forgotten:
   - Free trials that auto-converted
   - Annual renewals
   - Old gym memberships
   - Software subscriptions
   - Streaming services
   - Club memberships

3. DOCUMENT GAPS - Important documents not uploaded:
   - Will / Trust
   - Power of Attorney
   - Healthcare directive
   - Marriage certificate
   - Divorce decrees
   - Tax returns
   - Property deeds
   - Loan agreements

4. RISK INDICATORS - Patterns suggesting financial risk

Return JSON with findings and suggested actions."""

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

def call_ai(prompt, system=DETECTIVE_PROMPT, max_tokens=8192, temperature=0.4):
    try:
        messages = [{"role": "user", "content": prompt}]
        text = call_llm(messages, system=system, max_tokens=max_tokens, temperature=temperature, json_mode=True)
        return extract_json(text) or "{}"
    except Exception as e:
        return json.dumps({"error": str(e)})

def scan_for_missing(user_id):
    docs_resp = DOCS_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        ExpressionAttributeValues={":uid": user_id},
    )
    docs = docs_resp.get("Items", [])

    twin_resp = TWIN_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        Limit=1,
        ScanIndexForward=False,
        ExpressionAttributeValues={":uid": user_id},
    )
    twin = (twin_resp.get("Items") or [None])[0]

    categories_found = set(d.get("category", "") for d in docs)

    prompt = f"""User has {len(docs)} documents in categories: {', '.join(categories_found)}.

Financial Twin: {json.dumps(twin, default=str)[:2000] if twin else "Not yet built"}

Analyze and find missing assets, hidden subscriptions, and risks. Return JSON:
{{
  "missingAssets": [{{"type": "...", "suggested": "...", "reason": "why this might exist", "confidence": 0-100}}],
  "hiddenSubscriptions": [{{"name": "...", "estimatedAmount": "...", "reason": "why suspected", "confidence": 0-100}}],
  "documentGaps": [{{"documentType": "...", "importance": "critical|high|medium|low", "reason": "..."}}],
  "riskIndicators": [{{"type": "...", "description": "...", "severity": "low|medium|high|critical"}}],
  "summary": "Overall detective assessment in 2-3 sentences"
}}"""

    result = call_ai(prompt)
    try:
        return json.loads(result)
    except (json.JSONDecodeError, TypeError):
        return {"error": "Analysis failed", "raw": result[:500]}

def lambda_handler(event, context):
    http = event.get("httpMethod", "GET")
    path = event.get("path", "")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    if http == "POST" and "/detective/scan" in path:
        result = scan_for_missing(user_id)
        return respond(200, result)

    if http == "GET" and "/detective/missing" in path:
        result = scan_for_missing(user_id)
        return respond(200, {"missingAssets": result.get("missingAssets", []), "documentGaps": result.get("documentGaps", [])})

    if http == "GET" and "/detective/subscriptions" in path:
        result = scan_for_missing(user_id)
        return respond(200, {"hiddenSubscriptions": result.get("hiddenSubscriptions", [])})

    return respond(404, {"error": "Not found"})

def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization"},
        "body": json.dumps(body, default=str),
    }
