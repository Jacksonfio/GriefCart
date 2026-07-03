import json, os, time, boto3, urllib.request, urllib.error
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
secretsmanager = boto3.client("secretsmanager")

USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TWIN_TABLE = dynamodb.Table(os.environ["FINANCIAL_TWIN_TABLE"])

GEMINI_MODEL = "gemini-2.5-flash"
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "gemini").lower()


def call_llm(messages, system=None, max_tokens=1000, temperature=0.7, json_mode=False):
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

CHAT_PROMPT = """You are GriefCart's AI Financial Continuity Assistant. You help users understand and manage their financial life.

You can:
- Answer questions about their financial documents
- Explain their Financial Digital Twin
- Suggest what documents are missing
- Recommend improvements to their continuity plan
- Guide emergency scenarios

Be concise, specific, reference their actual data. If they ask about something not in their data, suggest how to add it."""

def get_chat_context(user_id):
    context = {"userId": user_id}

    user_resp = USERS_TABLE.get_item(Key={"userId": user_id})
    context["user"] = user_resp.get("Item", {})

    docs_resp = DOCS_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        Limit=10,
        ExpressionAttributeValues={":uid": user_id},
    )
    context["documents"] = docs_resp.get("Items", [])

    twin_resp = TWIN_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        Limit=1,
        ScanIndexForward=False,
        ExpressionAttributeValues={":uid": user_id},
    )
    twins = twin_resp.get("Items", [])
    if twins:
        twin = dict(twins[0])
        twin.pop("twinId", None)
        twin.pop("userId", None)
        context["financialTwin"] = twin

    return context

def lambda_handler(event, context):
    http = event.get("httpMethod", "POST")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    body = json.loads(event.get("body", "{}"))
    message = body.get("message", "")
    history = body.get("history", [])

    ctx = get_chat_context(user_id)

    prompt = f"""User: {message}

User Context:
{json.dumps(ctx, default=str)[:3000]}

Conversation history (last 5 messages):
{json.dumps(history[-5:], default=str)}

Answer the user's question using their data. Be helpful and specific."""

    try:
        answer = call_llm([{"role": "user", "content": prompt}], system=CHAT_PROMPT, max_tokens=1000, temperature=0.7)
        if not answer:
            answer = "I'm sorry, I encountered an error processing your request. Please try again."
    except Exception:
        answer = "I'm sorry, I encountered an error processing your request. Please try again."

    return respond(200, {
        "message": answer,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "hasTwin": ctx.get("financialTwin") is not None,
    })

def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=str),
    }
