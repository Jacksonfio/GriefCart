import json, os, time, uuid, boto3, urllib.request, urllib.error
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")
secretsmanager = boto3.client("secretsmanager")

TABLE = dynamodb.Table(os.environ["LEGACY_TABLE"])
DOC_BUCKET = os.environ["DOCUMENT_BUCKET"]

GEMINI_MODEL = "gemini-2.5-flash"
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "gemini").lower()


def call_llm(messages, system=None, max_tokens=2000, temperature=0.8, json_mode=False):
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

LEGACY_PROMPT = """You are an AI Legacy Letter composer for GriefCart. Your role is to transform a person's answers about their financial and personal wishes into a beautiful, compassionate legacy document.

The document should:
- Be addressed to their trusted persons by name
- Include specific financial instructions extracted from their answers
- Weave in their personal messages verbatim where appropriate
- Have a warm, dignified tone — not overly legal or cold
- Be organized into clear sections
- Include practical next steps for each trusted person

Write in first person as if the user is speaking to their loved ones."""

def get_answers(legacy_id):
    resp = TABLE.get_item(Key={"legacyId": legacy_id})
    return resp.get("Item")

def put_answers(item):
    TABLE.put_item(Item=item)

def generate_legacy(answers):
    prompt = f"""Create a legacy document from these answers:

Personal Messages to Trusted Persons:
{json.dumps(answers.get('personalMessages', []), default=str)}

Financial Wishes:
{answers.get('financialWishes', 'Not specified')}

Funeral & Memorial Preferences:
{answers.get('funeralPreferences', 'Not specified')}

Digital Legacy Instructions:
{answers.get('digitalLegacy', 'Not specified')}

Final Words:
{answers.get('finalWords', 'Not specified')}

Write a warm, first-person legacy document that captures this person's voice and wishes."""

    return call_llm([{"role": "user", "content": prompt}], system=LEGACY_PROMPT, max_tokens=2000, temperature=0.8)

def lambda_handler(event, context):
    http = event.get("httpMethod", "GET")
    path = event.get("path", "")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    if http == "GET" and path == "/legacy":
        resp = TABLE.query(
            IndexName="userId-index",
            KeyConditionExpression="userId = :uid",
            ExpressionAttributeValues={":uid": user_id},
            Limit=1,
            ScanIndexForward=False,
        )
        items = resp.get("Items", [])
        return respond(200, items[0] if items else {"status": "none", "legacyId": None})

    if http == "POST" and path == "/legacy":
        body = json.loads(event.get("body", "{}"))
        existing_id = body.get("legacyId")
        legacy_id = existing_id or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        item = {
            "legacyId": legacy_id,
            "userId": user_id,
            "status": body.get("status", "draft"),
            "personalMessages": body.get("personalMessages", []),
            "financialWishes": body.get("financialWishes", ""),
            "funeralPreferences": body.get("funeralPreferences", ""),
            "digitalLegacy": body.get("digitalLegacy", ""),
            "finalWords": body.get("finalWords", ""),
            "updatedAt": now,
            "completedAt": now if body.get("status") == "complete" else body.get("completedAt", None),
        }
        put_answers(item)
        return respond(200, {"legacyId": legacy_id, "status": item["status"], "updatedAt": now})

    if http == "POST" and "/generate" in path:
        body = json.loads(event.get("body", "{}"))
        legacy_id = body.get("legacyId")
        if not legacy_id:
            resp = TABLE.query(
                IndexName="userId-index",
                KeyConditionExpression="userId = :uid",
                ExpressionAttributeValues={":uid": user_id},
                Limit=1,
                ScanIndexForward=False,
            )
            items = resp.get("Items", [])
            if not items:
                return respond(400, {"error": "No legacy answers found. Save answers first."})
            legacy_id = items[0]["legacyId"]

        answers = get_answers(legacy_id)
        if not answers:
            return respond(404, {"error": "Legacy answers not found"})

        content = generate_legacy(answers)
        doc_id = str(uuid.uuid4())
        s3_key = f"legacy/{user_id}/{doc_id}.txt"

        s3.put_object(
            Bucket=DOC_BUCKET,
            Key=s3_key,
            Body=content.encode("utf-8"),
            ContentType="text/plain",
            ServerSideEncryption="aws:kms",
            SSEKMSKeyId=os.environ["KMS_KEY_ID"],
            Metadata={"user-id": user_id, "legacy-id": legacy_id, "type": "legacy-letter"},
        )

        return respond(200, {
            "documentId": doc_id,
            "legacyId": legacy_id,
            "content": content,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "version": 1,
        })

    return respond(404, {"error": "Not found"})

def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=str),
    }
