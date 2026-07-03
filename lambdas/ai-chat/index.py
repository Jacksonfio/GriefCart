"""
AI Chat Lambda — powered by AWS Bedrock (Meta Llama 3 / open-source models)
with HuggingFace Inference API fallback and Gemini legacy fallback.
"""
import json, os, sys, boto3
from datetime import datetime, timezone

# Make shared module importable (Lambda layer or co-deployed shared/)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from llm_client import call_llm

dynamodb = boto3.resource("dynamodb")
USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TWIN_TABLE = dynamodb.Table(os.environ["FINANCIAL_TWIN_TABLE"])

CHAT_SYSTEM_PROMPT = """You are GriefCart's AI Financial Continuity Assistant — a compassionate expert helping users manage their financial life and prepare for emergencies.

You can:
- Answer questions about their financial documents
- Explain their Financial Digital Twin data
- Identify missing documents or overlooked assets
- Recommend improvements to their continuity plan
- Guide trusted persons through emergency recovery scenarios

Always be concise, specific, and reference the user's actual data. If information is missing, suggest how to add it."""


def get_chat_context(user_id: str) -> dict:
    ctx: dict = {"userId": user_id}

    user_resp = USERS_TABLE.get_item(Key={"userId": user_id})
    ctx["user"] = user_resp.get("Item", {})

    docs_resp = DOCS_TABLE.query(
        IndexName="userId-index",
        KeyConditionExpression="userId = :uid",
        Limit=10,
        ExpressionAttributeValues={":uid": user_id},
    )
    ctx["documents"] = docs_resp.get("Items", [])

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
        ctx["financialTwin"] = twin

    return ctx


def lambda_handler(event, context):
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    body = json.loads(event.get("body", "{}"))
    message = body.get("message", "")
    history = body.get("history", [])

    if not message:
        return respond(400, {"error": "message is required"})

    ctx = get_chat_context(user_id)

    prompt = f"""User question: {message}

User's Financial Context (use this data to give specific, personalised answers):
{json.dumps(ctx, default=str)[:3000]}

Conversation history (last 5 messages):
{json.dumps(history[-5:], default=str)}

Answer the user's question based on their actual data. Be helpful, specific, and compassionate."""

    try:
        answer = call_llm(
            [{"role": "user", "content": prompt}],
            system=CHAT_SYSTEM_PROMPT,
            max_tokens=1000,
            temperature=0.7,
        )
        if not answer:
            answer = "I'm sorry, I encountered an issue processing your request. Please try again in a moment."
    except Exception as e:
        print(f"Chat error: {e}")
        answer = "I'm sorry, I encountered an error. Please try again."

    return respond(200, {
        "message": answer,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "hasTwin": ctx.get("financialTwin") is not None,
        "provider": os.environ.get("LLM_PROVIDER", "bedrock"),
    })


def respond(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body, default=str),
    }
