import json, os, time, uuid, boto3, urllib.request, urllib.error
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
sqs = boto3.client("sqs")
secretsmanager = boto3.client("secretsmanager")

USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TWIN_TABLE = dynamodb.Table(os.environ["FINANCIAL_TWIN_TABLE"])
GRAPH_SYNC_QUEUE = os.environ["GRAPH_SYNC_QUEUE"]

GEMINI_MODEL = "gemini-2.5-flash"
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "gemini").lower()


def call_llm(messages, system=None, max_tokens=8192, temperature=0.3, json_mode=False):
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

TWIN_SYSTEM_PROMPT = """You are the GriefCart Financial Digital Twin engine. You build a comprehensive AI model of a person's financial life.

Given a user's documents and profile, extract and structure:
1. ASSETS: accounts, property, investments, vehicles, valuables
2. LIABILITIES: loans, credit cards, mortgages, debts
3. INSURANCE: life, health, vehicle, home policies with coverage
4. RECURRING: subscriptions, memberships, utilities, regular payments
5. INCOME: salary, passive income, benefits, pensions
6. RELATIONSHIPS: how each item connects (e.g., mortgage -> property, insurance -> vehicle)
7. RISKS: gaps in coverage, unaddressed liabilities, missing documents
8. CONTINUITY: what happens to each item if user becomes unavailable

Return as structured JSON with confidence scores (0-100) for each extraction."""

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

def call_ai(prompt, system=TWIN_SYSTEM_PROMPT, max_tokens=8192, temperature=0.3):
    try:
        messages = [{"role": "user", "content": prompt}]
        text = call_llm(messages, system=system, max_tokens=max_tokens, temperature=temperature, json_mode=True)
        return extract_json(text) or "{}"
    except Exception as e:
        return json.dumps({"error": str(e)})

def build_twin(user_id):
    user_resp = USERS_TABLE.get_item(Key={"userId": user_id})
    user = user_resp.get("Item", {})

    docs_resp = DOCS_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        ExpressionAttributeValues={":uid": user_id},
    )
    documents = docs_resp.get("Items", [])

    doc_summary = "\n".join([
        f"- {d.get('fileName', 'Unknown')} ({d.get('category', 'uncategorized')}, {d.get('size', 0)} bytes)"
        for d in documents
    ])

    prompt = f"""Build a Financial Digital Twin for {user.get('email', 'Unknown')}.

Documents uploaded ({len(documents)} total):
{doc_summary}

Extract all financial entities, relationships, and risks. Return JSON:
{{
  "twinVersion": "2.0",
  "generatedAt": "...",
  "profile": {{ "email": "...", "totalDocuments": N, "estimatedNetWorth": "range or null" }},
  "assets": [{{ "type": "bank_account|property|investment|vehicle|other", "name": "...", "value": "estimated or null", "sourceDocument": "filename", "confidence": 0-100, "continuityRisk": "low|medium|high" }}],
  "liabilities": [{{ "type": "loan|credit_card|mortgage|debt", "name": "...", "amount": "estimated or null", "sourceDocument": "filename", "confidence": 0-100 }}],
  "insurance": [{{ "type": "life|health|vehicle|home", "provider": "...", "coverage": "...", "expiry": "... or null", "sourceDocument": "filename" }}],
  "recurringPayments": [{{ "name": "...", "amount": "estimated", "frequency": "monthly|yearly|weekly", "category": "subscription|utility|membership|other" }}],
  "relationships": [{{ "from": "entity1", "to": "entity2", "type": "secured_by|covers|pays_for|owned_by" }}],
  "risks": [{{ "type": "coverage_gap|missing_document|unaddressed_liability", "description": "...", "severity": "low|medium|high|critical" }}],
  "missingAssets": ["potential asset types not found in documents"],
  "continuityPlan": {{ "criticalItems": [...], "trustedAccess": "none|partial|full", "recommendations": [...] }}
}}"""

    result = call_ai(prompt)
    try:
        twin_data = json.loads(result)
    except (json.JSONDecodeError, TypeError):
        twin_data = {"error": "Failed to parse AI response", "raw": result[:500]}

    twin_id = str(uuid.uuid4())
    twin_data["twinId"] = twin_id
    twin_data["userId"] = user_id
    twin_data["generatedAt"] = datetime.now(timezone.utc).isoformat()

    TWIN_TABLE.put_item(Item=twin_data)

    USERS_TABLE.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET twinStatus = :status",
        ExpressionAttributeValues={":status": "ready"},
    )

    sqs.send_message(
        QueueUrl=GRAPH_SYNC_QUEUE,
        MessageBody=json.dumps({"action": "sync_twin", "twinId": twin_id, "userId": user_id}),
    )

    return twin_data

def query_twin(user_id, question):
    twin_resp = TWIN_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        ExpressionAttributeValues={":uid": user_id},
    )
    twins = sorted(twin_resp.get("Items", []), key=lambda t: t.get("generatedAt", ""), reverse=True)
    if not twins:
        return {"answer": "No Financial Twin found. Upload documents and click Rebuild first.", "twinGeneratedAt": None}

    twin = twins[0]

    prompt = f"""You are the GriefCart Financial Digital Twin for this user.

User question: {question}

Your knowledge base (Financial Twin data):
{json.dumps(twin, default=str, indent=2)[:3000]}

Answer the user's question based on their financial data. Be specific, reference actual documents and values. If you don't know something, say so. Suggest what documents would help fill gaps."""

    messages = [{"role": "user", "content": prompt}]
    result = call_llm(messages, system="You are a helpful financial continuity AI assistant.", max_tokens=1000, temperature=0.7, json_mode=False)
    if not result:
        result = "I'm sorry, I couldn't process that question right now. Please try again."
    return {"answer": result, "twinGeneratedAt": twin.get("generatedAt")}

def lambda_handler(event, context):
    http = event.get("httpMethod", "GET")
    path = event.get("path", "")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if not user_id:
        if event.get("Records"):
            record = event["Records"][0]
            body = json.loads(record.get("body", "{}"))
            user_id = body.get("userId", "")
            twin = build_twin(user_id)
            return {"statusCode": 200, "body": json.dumps({"twinId": twin.get("twinId")})}

        return respond(401, {"error": "Unauthorized"})

    if http == "GET" and path == "/twin":
        twin_resp = TWIN_TABLE.query(
            IndexName="userId-index",
            KeyConditionExpression="userId = :uid",
            ExpressionAttributeValues={":uid": user_id},
        )
        twins = sorted(twin_resp.get("Items", []), key=lambda t: t.get("generatedAt", ""), reverse=True)
        if not twins:
            return respond(200, {"twin": None, "status": "pending"})
        return respond(200, {"twin": twins[0], "status": "ready"})

    if http == "POST" and "/twin/query" in path:
        body = json.loads(event.get("body", "{}"))
        question = body.get("question", "")
        result = query_twin(user_id, question)
        return respond(200, result)

    if http == "POST" and "/twin/refresh" in path:
        twin = build_twin(user_id)
        return respond(200, {"status": "refreshed", "twinId": twin.get("twinId")})

    return respond(404, {"error": "Not found"})


def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization"},
        "body": json.dumps(body, default=str),
    }
