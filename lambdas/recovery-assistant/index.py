"""
Recovery Assistant Lambda — powered by AWS Bedrock (Meta Llama 3 / open-source models)
Generates a compassionate, step-by-step recovery guide for trusted persons.
"""
import json, os, sys, boto3
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from llm_client import call_llm

dynamodb = boto3.resource("dynamodb")
USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TRUSTED_TABLE = dynamodb.Table(os.environ["TRUSTED_PERSONS_TABLE"])
PLANS_TABLE = dynamodb.Table(os.environ["CONTINUITY_PLANS_TABLE"])

RECOVERY_SYSTEM_PROMPT = """You are GriefCart's Recovery Assistant — a compassionate, expert guide helping families navigate financial recovery after losing a loved one.

Your tone must be:
- Warm and empathetic (this person is going through grief)
- Clear and organized (numbered steps, no jargon)
- Specific and actionable (tell them exactly what to do and where)
- Prioritized (most urgent first)

Always assume trusted persons may be unfamiliar with the user's finances. Explain everything clearly."""


def generate_recovery_guide(user_id: str) -> dict:
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

    doc_summary = "\n".join([
        f"- {d['fileName']} (category: {d['category']}) — stored in GriefCart vault"
        for d in docs
    ]) if docs else "No documents have been uploaded to GriefCart yet"

    trusted_summary = "\n".join([
        f"- {t.get('name', 'Unknown')} ({t.get('relationship', 'relation unknown')}) — {t.get('accessLevel', 'none')} access — {t.get('email', 'no email')} — {'Verified ✓' if t.get('verificationStatus') == 'verified' else 'Pending verification ⚠'}"
        for t in trusted
    ]) if trusted else "No trusted persons have been designated"

    prompt = f"""Write a compassionate, practical recovery guide for the trusted persons of a GriefCart user who is now unavailable (deceased or incapacitated).

Account holder: {user.get('email', 'the account holder')}
Account created: {user.get('createdAt', 'unknown')}

Documents available in GriefCart vault ({len(docs)} documents):
{doc_summary}

Designated Trusted Persons ({len(trusted)} people):
{trusted_summary}

Has a Continuity Plan been created: {"Yes — detailed plan available" if plans else "No plan created yet"}

Write a clear, numbered recovery guide with these sections:

## SECTION 1: First 24 Hours — Immediate Actions
- Who to contact first
- Access to immediate funds
- Urgent notifications

## SECTION 2: First Week — Contacts and Notifications
- Financial institutions to notify
- Government agencies (Social Security, etc.)
- Employer and benefits

## SECTION 3: Accessing GriefCart Documents
- Step-by-step guide to accessing the document vault
- Which documents to retrieve first and why

## SECTION 4: Professional Help to Engage
- Estate attorney
- CPA/accountant
- Financial advisor
- Other specialists needed

## SECTION 5: Months 1-3 — Financial Settlement
- Asset transfer process
- Insurance claims
- Bill management
- Ongoing obligations

## SECTION 6: Long-Term Management
- Annual obligations (taxes, renewals)
- Asset monitoring
- Final settlement timeline

Write warmly, clearly, and with compassion. Use simple numbered steps. Acknowledge the emotional difficulty while providing clear practical guidance."""

    try:
        guide = call_llm(
            [{"role": "user", "content": prompt}],
            system=RECOVERY_SYSTEM_PROMPT,
            max_tokens=3000,
            temperature=0.5,
        )
        if not guide:
            guide = "Recovery guide generation is temporarily unavailable. Please ensure your documents and trusted persons are set up in GriefCart, then try again."
    except Exception as e:
        print(f"Recovery guide error: {e}")
        guide = "Recovery guide generation encountered an error. Please try again."

    return {
        "guide": guide,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "documentCount": len(docs),
        "trustedPersonCount": len(trusted),
        "hasPlan": len(plans) > 0,
        "trustedPersonNames": [t.get("name", "Unknown") for t in trusted if t.get("verificationStatus") == "verified"],
        "provider": os.environ.get("LLM_PROVIDER", "bedrock"),
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
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body, default=str),
    }
