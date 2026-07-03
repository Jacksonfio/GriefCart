"""
AI Search Lambda — powered by AWS Bedrock (Meta Llama 3 / open-source models)
with HuggingFace Inference API fallback and Gemini legacy fallback.
"""
import json, os, sys, boto3
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from llm_client import call_llm

dynamodb = boto3.resource("dynamodb")
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])

SEARCH_SYSTEM_PROMPT = """You are a financial document search expert. Given a search query about financial matters, 
return a structured JSON search plan that identifies:
1. Primary entities to look for (accounts, institutions, document types)
2. Alternative and related search terms
3. Most likely document categories to search in
4. Key financial terms associated with the query

Always respond with valid JSON only."""


def lambda_handler(event, context):
    body = json.loads(event.get("body", "{}"))
    query = body.get("query", "")
    user_id = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
        .get("sub", "")
    )

    if not query or not user_id:
        return respond(400, {"error": "query and authentication required"})

    # Fetch user's document categories for context
    try:
        docs_resp = DOCS_TABLE.query(
            IndexName="userId-index",
            KeyConditionExpression="userId = :uid",
            Limit=50,
            ExpressionAttributeValues={":uid": user_id},
        )
        docs = docs_resp.get("Items", [])
        categories = list(set(d.get("category", "unknown") for d in docs))
        doc_names = [d.get("fileName", "") for d in docs[:20]]
    except Exception:
        categories = []
        doc_names = []

    search_prompt = f"""Search query: "{query}"

User's document categories available: {", ".join(categories) if categories else "none uploaded yet"}
Document names (sample): {", ".join(doc_names[:10]) if doc_names else "none"}

Create a smart search plan as JSON:
{{
  "primaryTerms": ["main entities/terms to search for"],
  "alternativeTerms": ["synonyms and related terms"],
  "categories": ["document categories most relevant"],
  "financialEntities": ["banks, insurers, accounts mentioned or implied"],
  "dateRange": "any date context if relevant, else null",
  "suggestedFilters": ["filter suggestions for better results"],
  "confidence": 0-100
}}"""

    try:
        search_plan_text = call_llm(
            [{"role": "user", "content": search_prompt}],
            system=SEARCH_SYSTEM_PROMPT,
            max_tokens=500,
            temperature=0.3,
            json_mode=True,
        )
        try:
            search_plan = json.loads(search_plan_text)
        except (json.JSONDecodeError, TypeError):
            search_plan = {"terms": [query], "categories": categories, "raw": search_plan_text}
    except Exception as e:
        search_plan = {"terms": [query], "categories": [], "error": str(e)[:100]}

    return respond(200, {
        "query": query,
        "results": search_plan,
        "documentCount": len(docs) if "docs" in dir() else 0,
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
