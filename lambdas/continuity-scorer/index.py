"""
Continuity Scorer Lambda — powered by AWS Bedrock (Meta Llama 3 / open-source models)
Calculates a user's financial continuity readiness score with AI-generated assessment.
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


def calculate_score(user_id: str) -> dict:
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

    # ─── Scoring components ───────────────────────────────────────────────
    doc_count = len(docs)
    categories = set(d.get("category", "") for d in docs)
    trusted_count = len(trusted)
    verified_trusted = sum(1 for t in trusted if t.get("verificationStatus") == "verified")
    has_plan = len(plans) > 0
    plan_complete = any(p.get("status") == "complete" for p in plans)
    has_legal_docs = any(d.get("category") in ["legal", "will", "trust", "power_of_attorney"] for d in docs)
    has_insurance = any(d.get("category") in ["insurance", "life_insurance", "health_insurance"] for d in docs)
    has_financial = any(d.get("category") in ["bank", "investment", "loan", "retirement"] for d in docs)
    has_digital_docs = any(d.get("category") in ["digital", "crypto", "domain"] for d in docs)
    has_twin = bool(user.get("twinStatus") == "ready")

    # Days since last login
    try:
        last_login = datetime.fromisoformat(user.get("lastLoginAt", datetime.now(timezone.utc).isoformat()))
        days_since_login = (datetime.now(timezone.utc) - last_login).days
    except Exception:
        days_since_login = 0

    # Score calculation (max 100 points)
    score = 0
    score += min(doc_count * 4, 20)          # Up to 20 pts for quantity (5 docs = 20)
    score += min(len(categories) * 4, 20)    # Up to 20 pts for category coverage
    score += min(verified_trusted * 12, 24)  # Up to 24 pts for verified trusted persons
    score += 10 if has_legal_docs else 0     # 10 pts for legal docs
    score += 6 if has_insurance else 0       # 6 pts for insurance docs
    score += 6 if has_financial else 0       # 6 pts for financial account docs
    score += 4 if has_plan else 0            # 4 pts for having a plan
    score += 5 if plan_complete else 0       # 5 pts for completed plan
    score += 3 if has_digital_docs else 0    # 3 pts for digital asset docs
    score += 2 if has_twin else 0            # 2 pts for built Financial Twin
    # Penalty for inactivity
    if days_since_login > 30:
        score = max(0, score - 5)
    score = max(0, min(100, score))

    # Breakdown
    breakdown = {
        "documents": min(doc_count * 4, 20),
        "categoryCoverage": min(len(categories) * 4, 20),
        "trustedPersons": min(verified_trusted * 12, 24),
        "legalDocs": 10 if has_legal_docs else 0,
        "insurance": 6 if has_insurance else 0,
        "financialDocs": 6 if has_financial else 0,
        "hasPlan": 4 if has_plan else 0,
        "planComplete": 5 if plan_complete else 0,
        "digitalAssets": 3 if has_digital_docs else 0,
        "financialTwin": 2 if has_twin else 0,
        "activityBonus": -5 if days_since_login > 30 else 0,
    }

    # Missing categories for targeted recommendations
    important_categories = ["will", "insurance", "bank", "investment", "legal", "tax", "property"]
    missing = [c for c in important_categories if c not in categories]
    next_steps = []
    if not has_legal_docs:
        next_steps.append("Upload your will, trust, or power of attorney documents (+10 points)")
    if not has_insurance:
        next_steps.append("Upload your insurance policies — life, health, or auto (+6 points)")
    if verified_trusted < 2:
        next_steps.append(f"Add and verify trusted persons — currently {verified_trusted} verified (+{(2 - verified_trusted) * 12} points)")
    if not has_plan:
        next_steps.append("Generate your Continuity Plan from the Emergency tab (+4 points)")
    if not has_twin:
        next_steps.append("Build your Financial Digital Twin from the Twin tab (+2 points)")

    # AI assessment
    prompt = f"""A user's financial continuity score is {score}/100.

Profile:
- Total documents: {doc_count}
- Document categories: {", ".join(sorted(categories)) if categories else "none"}
- Trusted persons: {trusted_count} ({verified_trusted} verified)
- Has will/legal docs: {has_legal_docs}
- Has insurance docs: {has_insurance}
- Has financial account docs: {has_financial}
- Has continuity plan: {has_plan}
- Has Financial Twin: {has_twin}
- Days since last login: {days_since_login}

Write a 2-3 sentence assessment that:
1. Explains what the score means for their family's preparedness
2. Highlights their biggest gap
3. Gives one specific, encouraging action to improve

Be warm, direct, and motivating — not technical."""

    assessment = call_llm(
        [{"role": "user", "content": prompt}],
        system="You are a compassionate financial continuity advisor. Give brief, actionable assessments.",
        max_tokens=200,
        temperature=0.7,
    )

    if not assessment:
        assessment = f"Your continuity score is {score}/100. " + (
            f"Great foundation — keep adding documents and verifying trusted persons to strengthen your plan."
            if score >= 50 else
            "Getting started is the hardest part. Upload a few key documents to significantly boost your score."
        )

    # Persist score to user record
    try:
        USERS_TABLE.update_item(
            Key={"userId": user_id},
            UpdateExpression="SET continuityScore = :score, lastScoreAt = :ts",
            ExpressionAttributeValues={
                ":score": score,
                ":ts": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as e:
        print(f"Failed to persist score (non-fatal): {e}")

    # Score tier
    if score >= 80:
        tier, color = "Excellent", "emerald"
    elif score >= 60:
        tier, color = "Good", "green"
    elif score >= 40:
        tier, color = "Fair", "amber"
    elif score >= 20:
        tier, color = "Needs Work", "orange"
    else:
        tier, color = "Critical", "red"

    return {
        "score": score,
        "tier": tier,
        "color": color,
        "assessment": assessment,
        "breakdown": breakdown,
        "nextSteps": next_steps,
        "missingCategories": missing,
        "maxScore": 100,
        "provider": os.environ.get("LLM_PROVIDER", "bedrock"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


def lambda_handler(event, context):
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    try:
        result = calculate_score(user_id)
        return respond(200, result)
    except Exception as e:
        print(f"Scorer error: {e}")
        return respond(200, {
            "score": 0,
            "tier": "Unknown",
            "assessment": "Unable to calculate score right now. Please try again.",
            "breakdown": {},
            "nextSteps": ["Upload your first document to get started"],
            "maxScore": 100,
            "color": "red",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        })


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
