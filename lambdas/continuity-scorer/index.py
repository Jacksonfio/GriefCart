import json, os, time, boto3, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

dynamodb = boto3.resource("dynamodb")
secretsmanager = boto3.client("secretsmanager")

USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TRUSTED_TABLE = dynamodb.Table(os.environ["TRUSTED_PERSONS_TABLE"])
PLANS_TABLE = dynamodb.Table(os.environ["CONTINUITY_PLANS_TABLE"])

GEMINI_MODEL = "gemini-2.5-flash"
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "gemini").lower()


def call_llm(messages, system=None, max_tokens=300, temperature=0.7, json_mode=False):
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

def calculate_score(user_id):
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

    doc_count = len(docs)
    categories = set(d.get("category", "") for d in docs)
    trusted_count = len(trusted)
    verified_trusted = sum(1 for t in trusted if t.get("verificationStatus") == "verified")
    has_plan = len(plans) > 0
    plan_complete = any(p.get("status") == "complete" for p in plans)
    has_legal_docs = any(d.get("category") in ["legal", "will", "trust"] for d in docs)
    has_insurance = any(d.get("category") == "insurance" for d in docs)
    has_financial = any(d.get("category") in ["bank", "investment", "loan"] for d in docs)
    days_since_login = (datetime.now(timezone.utc) - datetime.fromisoformat(user.get("lastLoginAt", datetime.now(timezone.utc).isoformat()))).days

    score = 0
    score += min(doc_count * 5, 25)
    score += min(len(categories) * 5, 20)
    score += min(verified_trusted * 10, 25)
    if has_legal_docs: score += 10
    if has_insurance: score += 5
    if has_financial: score += 5
    if has_plan: score += 5
    if plan_complete: score += 5
    score = max(0, min(100, score))

    prompt = f"""Given a user's Continuity Score of {score}/100, generate a brief assessment.

Profile:
- Documents: {doc_count} ({len(categories)} categories)
- Trusted Persons: {trusted_count} ({verified_trusted} verified)
- Has Plan: {has_plan}
- Legal Docs: {has_legal_docs}
- Days Since Login: {days_since_login}

Write 2-3 sentences explaining the score and specific recommendations for improvement. Be encouraging but honest."""

    assessment = call_llm([{"role": "user", "content": prompt}])
    if not assessment:
        assessment = f"Your continuity score is {score}/100. {5 - verified_trusted} of your trusted persons still need to be verified."

    breakdown = {
        "documents": min(doc_count * 5, 25),
        "coverage": min(len(categories) * 5, 20),
        "trustedPersons": min(verified_trusted * 10, 25),
        "legalDocs": 10 if has_legal_docs else 0,
        "insurance": 5 if has_insurance else 0,
        "financialDocs": 5 if has_financial else 0,
        "hasPlan": 5 if has_plan else 0,
        "planComplete": 5 if plan_complete else 0,
    }

    USERS_TABLE.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET continuityScore = :score",
        ExpressionAttributeValues={":score": score},
    )

    return {
        "score": score,
        "assessment": assessment,
        "breakdown": breakdown,
        "maxScore": 100,
        "color": "green" if score >= 70 else "amber" if score >= 40 else "red",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }

def lambda_handler(event, context):
    http = event.get("httpMethod", "GET")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    try:
        result = calculate_score(user_id)
        return respond(200, result)
    except Exception as e:
        return respond(200, {
            "score": 0,
            "assessment": "Unable to generate AI assessment. Your score is still calculated.",
            "breakdown": {},
            "maxScore": 100,
            "color": "red",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        })


def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization"},
        "body": json.dumps(body, default=str),
    }
