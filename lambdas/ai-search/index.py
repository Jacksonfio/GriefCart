import json, os, time, boto3, urllib.request, urllib.error
from datetime import datetime, timezone

secretsmanager = boto3.client("secretsmanager")

GEMINI_MODEL = "gemini-2.5-flash"
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "gemini").lower()


def call_llm(messages, system=None, max_tokens=500, temperature=0.3, json_mode=False):
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

def lambda_handler(event, context):
    http = event.get("httpMethod", "POST")
    body = json.loads(event.get("body", "{}"))
    query = body.get("query", "")
    user_id = event.get("requestContext", {}).get("authorizer", {}).get("claims", {}).get("sub", "")

    if not query or not user_id:
        return respond(400, {"error": "query required"})

    search_prompt = f"""Given the search query: "{query}"

Return a structured search plan with:
1. The key financial entities to search for
2. Alternative search terms
3. Categories to look in

Return as JSON."""

    try:
        search_plan = call_llm([{"role": "user", "content": search_prompt}], max_tokens=500, temperature=0.3)
    except Exception:
        search_plan = json.dumps({"terms": [query], "categories": []})

    return respond(200, {"query": query, "results": search_plan})

def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=str),
    }
