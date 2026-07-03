"""
Continuity Plan Lambda — powered by AWS Bedrock (Meta Llama 3 / open-source models)
Generates a comprehensive, phased emergency continuity plan.
"""
import json, os, sys, re, uuid, boto3
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from llm_client import call_llm

dynamodb = boto3.resource("dynamodb")
USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TRUSTED_TABLE = dynamodb.Table(os.environ["TRUSTED_PERSONS_TABLE"])
PLANS_TABLE = dynamodb.Table(os.environ["CONTINUITY_PLANS_TABLE"])

PLAN_SYSTEM_PROMPT = """You are GriefCart's Continuity Plan Generator — an expert in estate planning, financial continuity, and emergency preparedness.

Given a user's documents and trusted persons, generate a detailed, actionable emergency continuity plan covering:

PHASE 1 — Immediate (0-24 hours): Urgent notifications, safety, access to funds
PHASE 2 — Week 1: Legal notifications, document gathering, financial institution contacts
PHASE 3 — Month 1: Asset consolidation, bill management, insurance claims initiation
PHASE 4 — Month 3: Asset transfer, estate settlement, ongoing management setup
PHASE 5 — Ongoing: Long-term management, tax obligations, monitoring

For each action: specify WHO handles it, WHAT documents are needed, and WHY it's important.
Always respond with valid JSON only."""


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


def generate_plan(user_id: str) -> dict:
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

    doc_summary = "\n".join([
        f"- {d['fileName']} ({d['category']}) — uploaded {d.get('uploadedAt', 'unknown')}"
        for d in docs
    ]) if docs else "No documents uploaded"

    trusted_summary = "\n".join([
        f"- {t.get('name', 'Unknown')} ({t.get('relationship', 'unknown')}) — {t.get('accessLevel', 'none')} access — {'✓ verified' if t.get('verificationStatus') == 'verified' else '⚠ pending verification'} — {t.get('email', 'no email')}"
        for t in trusted
    ]) if trusted else "No trusted persons designated"

    prompt = f"""Generate a complete emergency continuity plan for {user.get('email', 'this user')}.

Documents available ({len(docs)} total):
{doc_summary}

Trusted persons ({len(trusted)} designated):
{trusted_summary}

Return this exact JSON:
{{
  "planId": "auto",
  "generatedAt": "{datetime.now(timezone.utc).isoformat()}",
  "preparednessLevel": "low|medium|high|excellent",
  "phases": [
    {{
      "phase": "immediate|week1|month1|month3|ongoing",
      "title": "Phase title",
      "timeframe": "e.g. First 24 hours",
      "actions": [
        {{
          "action": "specific action to take",
          "assignedTo": "person name or 'primary executor' or 'all trusted persons'",
          "priority": "critical|high|medium|low",
          "documentRefs": ["referenced document names"],
          "details": "step-by-step instructions",
          "estimatedTime": "how long this takes"
        }}
      ]
    }}
  ],
  "criticalContacts": [
    {{
      "name": "contact name",
      "role": "attorney|accountant|financial_advisor|government|bank|insurance|other",
      "organization": "company/institution name",
      "phone": "number if known",
      "email": "email if known",
      "priority": "critical|high|medium"
    }}
  ],
  "documentChecklist": [
    {{
      "document": "document name",
      "location": "physical or digital location",
      "importance": "critical|important|helpful",
      "status": "uploaded|missing|unknown"
    }}
  ],
  "institutionList": [
    {{
      "name": "institution name",
      "type": "bank|brokerage|insurance|government|employer|other",
      "accountType": "checking|savings|investment|loan|insurance|other",
      "contactInfo": "phone or website",
      "notificationRequired": true/false,
      "notificationDeadline": "time frame or null"
    }}
  ],
  "legalSteps": [
    {{
      "step": "legal action required",
      "deadline": "time constraint or null",
      "professional": "type of professional needed",
      "estimatedCost": "rough estimate or null"
    }}
  ],
  "financialSummary": {{
    "estimatedLiquidAssets": "amount available immediately",
    "monthlyObligations": "recurring bills amount",
    "insurancePayout": "expected life insurance amount if applicable"
  }},
  "recommendations": ["actionable improvements to make this plan more complete"],
  "warnings": ["critical gaps or risks that could complicate the process"]
}}"""

    text = call_llm(
        [{"role": "user", "content": prompt}],
        system=PLAN_SYSTEM_PROMPT,
        max_tokens=8192,
        temperature=0.4,
        json_mode=True,
    )

    try:
        plan_data = json.loads(extract_json(text))
    except (json.JSONDecodeError, TypeError) as e:
        raw = text[:500] if text else "No LLM output"
        return {"error": f"Failed to parse plan: {str(e)[:200]}. Raw preview: {raw}"}

    plan_id = str(uuid.uuid4())
    plan_data["planId"] = plan_id
    plan_data["userId"] = user_id
    plan_data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    plan_data["status"] = "complete"
    plan_data["provider"] = os.environ.get("LLM_PROVIDER", "bedrock")

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
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body, default=str),
    }
