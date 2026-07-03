"""
Financial Detective Lambda — powered by AWS Bedrock (Meta Llama 3 / open-source models)
Identifies missing assets, hidden subscriptions, document gaps, and risk indicators.
"""
import json, os, sys, re, boto3
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from llm_client import call_llm

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")

USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TWIN_TABLE = dynamodb.Table(os.environ["FINANCIAL_TWIN_TABLE"])

DETECTIVE_SYSTEM_PROMPT = """You are the GriefCart AI Financial Detective — an expert at uncovering hidden assets, forgotten subscriptions, and financial gaps.

Given a user's financial document inventory and their Financial Digital Twin, your job is to:

1. MISSING ASSETS — Identify common assets users forget to declare:
   - Life insurance policies (term, whole, universal)
   - Retirement accounts (401k, IRA, Roth IRA, pension, 403b)
   - Safe deposit boxes
   - Digital assets (crypto, NFTs, domain names, digital businesses)
   - Timeshares or vacation properties
   - Business interests, partnerships, or equity stakes
   - Trust accounts or estate accounts
   - Prepaid funeral or burial plans
   - Unclaimed government property or tax refunds
   - Royalties or intellectual property

2. HIDDEN SUBSCRIPTIONS — Find recurring charges that may be forgotten:
   - Free trials that auto-converted to paid
   - Annual renewals (software, domains, memberships)
   - Old gym or club memberships
   - Streaming services (multiple overlapping)
   - SaaS tools and software subscriptions
   - Insurance premiums charged annually

3. DOCUMENT GAPS — Identify important documents not yet uploaded:
   - Will or Living Trust
   - Durable Power of Attorney
   - Healthcare directive / living will
   - Marriage certificate, divorce decrees
   - Recent tax returns (3 years)
   - Property deeds and titles
   - Vehicle titles
   - Loan and mortgage agreements
   - Business formation documents

4. RISK INDICATORS — Patterns suggesting financial vulnerability

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


def scan_for_missing(user_id: str) -> dict:
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
    doc_names = [d.get("fileName", "Unknown") for d in docs]

    # Expected financial document categories
    expected_categories = {
        "will", "trust", "insurance", "bank", "investment", "loan",
        "mortgage", "tax", "property", "vehicle", "pension", "retirement",
        "life_insurance", "health_insurance", "power_of_attorney"
    }
    missing_categories = expected_categories - categories_found

    prompt = f"""Analyze this user's financial portfolio for the AI Financial Detective scan.

Documents uploaded ({len(docs)} total):
Categories present: {", ".join(sorted(categories_found)) if categories_found else "none"}
Missing expected categories: {", ".join(sorted(missing_categories))}
Document names: {", ".join(doc_names[:20])}

Financial Digital Twin: {json.dumps(twin, default=str)[:2000] if twin else "Not yet built — user has not run twin analysis"}

Based on what IS and IS NOT present, identify:

Return this exact JSON structure:
{{
  "missingAssets": [
    {{"type": "asset type", "suggested": "specific example", "reason": "why this likely exists", "confidence": 0-100, "priority": "high|medium|low"}}
  ],
  "hiddenSubscriptions": [
    {{"name": "service name", "estimatedAmount": "$X/month or year", "reason": "why suspected", "confidence": 0-100}}
  ],
  "documentGaps": [
    {{"documentType": "document name", "importance": "critical|high|medium|low", "reason": "why needed", "actionRequired": "what to do"}}
  ],
  "riskIndicators": [
    {{"type": "risk category", "description": "specific risk", "severity": "low|medium|high|critical", "recommendation": "how to mitigate"}}
  ],
  "quickWins": ["simple immediate actions the user can take"],
  "summary": "Overall detective assessment in 2-3 sentences",
  "completenessScore": 0-100
}}"""

    try:
        text = call_llm(
            [{"role": "user", "content": prompt}],
            system=DETECTIVE_SYSTEM_PROMPT,
            max_tokens=8192,
            temperature=0.4,
            json_mode=True,
        )
        cleaned = extract_json(text)
        result = json.loads(cleaned)
        result["scannedAt"] = datetime.now(timezone.utc).isoformat()
        result["documentCount"] = len(docs)
        result["provider"] = os.environ.get("LLM_PROVIDER", "bedrock")
        return result
    except (json.JSONDecodeError, TypeError) as e:
        return {
            "error": "Detective analysis failed to parse",
            "scannedAt": datetime.now(timezone.utc).isoformat(),
            "documentCount": len(docs),
        }
    except Exception as e:
        return {"error": str(e)[:200]}


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
        return respond(200, {
            "missingAssets": result.get("missingAssets", []),
            "documentGaps": result.get("documentGaps", []),
            "quickWins": result.get("quickWins", []),
        })

    if http == "GET" and "/detective/subscriptions" in path:
        result = scan_for_missing(user_id)
        return respond(200, {"hiddenSubscriptions": result.get("hiddenSubscriptions", [])})

    if http == "GET" and "/detective/risks" in path:
        result = scan_for_missing(user_id)
        return respond(200, {
            "riskIndicators": result.get("riskIndicators", []),
            "completenessScore": result.get("completenessScore", 0),
            "summary": result.get("summary", ""),
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
