"""
Financial Digital Twin Lambda — powered by AWS Bedrock (Meta Llama 3 / open-source models)
Builds a comprehensive AI model of the user's financial life.
"""
import json, os, sys, re, uuid, boto3
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from llm_client import call_llm

dynamodb = boto3.resource("dynamodb")
sqs = boto3.client("sqs")

USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TWIN_TABLE = dynamodb.Table(os.environ["FINANCIAL_TWIN_TABLE"])
GRAPH_SYNC_QUEUE = os.environ["GRAPH_SYNC_QUEUE"]

TWIN_SYSTEM_PROMPT = """You are the GriefCart Financial Digital Twin engine — an advanced AI that constructs a complete, structured model of a person's financial life.

Given a user's document inventory and profile, you must extract and organize:
1. ASSETS: bank accounts, property, investments, vehicles, business interests, valuables, digital assets
2. LIABILITIES: mortgages, auto loans, personal loans, credit cards, student debt
3. INSURANCE: life, health, auto, home/renter, disability, umbrella policies
4. RECURRING: subscriptions, memberships, utilities, regular financial obligations
5. INCOME: salary, passive income, rental income, dividends, benefits, pensions
6. DIGITAL ASSETS: crypto, NFTs, domain names, online businesses, digital accounts
7. RELATIONSHIPS: how entities connect (mortgage → property, insurance → vehicle)
8. RISKS: coverage gaps, unaddressed liabilities, missing beneficiaries, expiring policies
9. CONTINUITY: what trusted persons need to know and do for each financial item

Always respond with valid JSON only. Be thorough but honest about uncertainty — use confidence scores."""


def extract_json(text: str) -> str:
    text = text.strip()
    if "```" in text:
        parts = text.split("```")
        text = parts[1] if len(parts) >= 2 else parts[0]
    if text.startswith("json"):
        text = text[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end >= 0:
        text = text[start:end + 1]
    text = re.sub(r",\s*}", "}", text)
    text = re.sub(r",\s*]", "]", text)
    return text


def build_twin(user_id: str) -> dict:
    user_resp = USERS_TABLE.get_item(Key={"userId": user_id})
    user = user_resp.get("Item", {})

    docs_resp = DOCS_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        ExpressionAttributeValues={":uid": user_id},
    )
    documents = docs_resp.get("Items", [])

    doc_summary = "\n".join([
        f"- {d.get('fileName', 'Unknown')} | category: {d.get('category', 'uncategorized')} | size: {d.get('size', 0)} bytes | uploaded: {d.get('uploadedAt', 'unknown')}"
        for d in documents
    ])

    prompt = f"""Build a comprehensive Financial Digital Twin for this GriefCart user.

User profile: {user.get('email', 'Unknown')}
Account created: {user.get('createdAt', 'unknown')}
Total documents: {len(documents)}

Document inventory:
{doc_summary if doc_summary else "No documents uploaded yet"}

Extract all financial entities, map their relationships, identify risks, and build a continuity plan. Return this JSON:
{{
  "twinVersion": "3.0",
  "generatedAt": "{datetime.now(timezone.utc).isoformat()}",
  "model": "{os.environ.get('BEDROCK_MODEL_ID', 'meta.llama3-70b-instruct-v1:0')}",
  "profile": {{
    "email": "...",
    "totalDocuments": {len(documents)},
    "estimatedNetWorth": "range estimate or null if insufficient data",
    "financialComplexity": "simple|moderate|complex",
    "primaryCurrency": "USD"
  }},
  "assets": [
    {{
      "type": "bank_account|property|investment|vehicle|digital|business|other",
      "name": "descriptive name",
      "value": "estimated value or null",
      "institution": "bank/broker/etc name if known",
      "accountNumber": "last 4 digits if identifiable, else null",
      "sourceDocument": "filename",
      "confidence": 0-100,
      "continuityRisk": "low|medium|high",
      "actionRequired": "what trusted person needs to do"
    }}
  ],
  "liabilities": [
    {{
      "type": "mortgage|auto_loan|personal_loan|credit_card|student_loan|other",
      "name": "descriptive name",
      "amount": "estimated balance or null",
      "interestRate": "rate if known, else null",
      "institution": "lender name if known",
      "sourceDocument": "filename",
      "confidence": 0-100,
      "monthlyPayment": "amount or null"
    }}
  ],
  "insurance": [
    {{
      "type": "life|health|auto|home|disability|umbrella|other",
      "provider": "company name",
      "policyNumber": "number if identifiable, else null",
      "coverage": "coverage amount or description",
      "premium": "monthly/annual premium if known",
      "beneficiaries": ["names if mentioned"],
      "expiry": "date or null",
      "sourceDocument": "filename",
      "confidence": 0-100
    }}
  ],
  "recurringPayments": [
    {{
      "name": "service/payee name",
      "amount": "estimated amount",
      "frequency": "monthly|yearly|weekly|quarterly",
      "category": "subscription|utility|membership|insurance|loan|tax|other",
      "autopay": true/false/null
    }}
  ],
  "digitalAssets": [
    {{
      "type": "crypto|nft|domain|account|business|other",
      "name": "platform or asset name",
      "value": "estimated or null",
      "accessInstructions": "how trusted persons access this",
      "confidence": 0-100
    }}
  ],
  "relationships": [
    {{"from": "entity1", "to": "entity2", "type": "secured_by|covers|pays_for|owned_by|benefits_from"}}
  ],
  "risks": [
    {{
      "type": "coverage_gap|missing_document|missing_beneficiary|expiring_policy|unaddressed_liability|access_risk",
      "description": "specific risk description",
      "severity": "low|medium|high|critical",
      "recommendation": "how to mitigate"
    }}
  ],
  "missingAssets": ["asset types likely present but not documented"],
  "continuityPlan": {{
    "criticalItems": ["most important items for trusted persons to handle immediately"],
    "trustedAccess": "none|partial|full",
    "immediateActions": ["first 24-hour priorities"],
    "recommendations": ["improvements to make the twin more complete"]
  }}
}}"""

    text = call_llm(
        [{"role": "user", "content": prompt}],
        system=TWIN_SYSTEM_PROMPT,
        max_tokens=8192,
        temperature=0.3,
        json_mode=True,
    )

    try:
        twin_data = json.loads(extract_json(text))
    except (json.JSONDecodeError, TypeError):
        twin_data = {
            "error": "Failed to parse AI response — twin data may be incomplete",
            "rawPreview": text[:500] if text else "No AI response",
        }

    # Persist twin
    twin_id = str(uuid.uuid4())
    twin_data["twinId"] = twin_id
    twin_data["userId"] = user_id
    twin_data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    twin_data["provider"] = os.environ.get("LLM_PROVIDER", "bedrock")

    TWIN_TABLE.put_item(Item=twin_data)

    USERS_TABLE.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET twinStatus = :status, lastTwinAt = :ts",
        ExpressionAttributeValues={
            ":status": "ready",
            ":ts": datetime.now(timezone.utc).isoformat(),
        },
    )

    try:
        sqs.send_message(
            QueueUrl=GRAPH_SYNC_QUEUE,
            MessageBody=json.dumps({"action": "sync_twin", "twinId": twin_id, "userId": user_id}),
        )
    except Exception as e:
        print(f"SQS send error (non-fatal): {e}")

    return twin_data


def query_twin(user_id: str, question: str) -> dict:
    twin_resp = TWIN_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        ExpressionAttributeValues={":uid": user_id},
    )
    twins = sorted(twin_resp.get("Items", []), key=lambda t: t.get("generatedAt", ""), reverse=True)

    if not twins:
        return {
            "answer": "No Financial Digital Twin found. Please upload some documents and click 'Rebuild Twin' to create your twin.",
            "twinGeneratedAt": None,
        }

    twin = twins[0]
    prompt = f"""You are the Financial Digital Twin for this GriefCart user.

User's question: {question}

Your complete financial knowledge base:
{json.dumps(twin, default=str, indent=2)[:3000]}

Answer the question based strictly on their documented financial data. Be specific, cite source documents where relevant. If data is missing or uncertain, say so and suggest what documents would fill the gap."""

    answer = call_llm(
        [{"role": "user", "content": prompt}],
        system="You are a helpful, precise financial continuity AI assistant. Always reference the user's actual documented data.",
        max_tokens=1000,
        temperature=0.7,
    )

    if not answer:
        answer = "I'm sorry, I couldn't process that question right now. Please try again."

    return {
        "answer": answer,
        "twinGeneratedAt": twin.get("generatedAt"),
        "twinVersion": twin.get("twinVersion", "unknown"),
        "provider": os.environ.get("LLM_PROVIDER", "bedrock"),
    }


def lambda_handler(event, context):
    http = event.get("httpMethod", "GET")
    path = event.get("path", "")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if not user_id:
        # SQS trigger
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
        if not question:
            return respond(400, {"error": "question is required"})
        result = query_twin(user_id, question)
        return respond(200, result)

    if http == "POST" and "/twin/refresh" in path:
        twin = build_twin(user_id)
        return respond(200, {
            "status": "refreshed",
            "twinId": twin.get("twinId"),
            "provider": twin.get("provider", "bedrock"),
        })

    return respond(404, {"error": "Not found"})


def respond(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body, default=str),
    }
