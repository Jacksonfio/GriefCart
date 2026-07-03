"""
Legacy Letters Lambda — powered by AWS Bedrock (Meta Llama 3 / open-source models)
Transforms a person's wishes and instructions into a beautiful, compassionate legacy document.
"""
import json, os, sys, re, uuid, boto3
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from llm_client import call_llm

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")

TABLE = dynamodb.Table(os.environ["LEGACY_TABLE"])
DOC_BUCKET = os.environ["DOCUMENT_BUCKET"]

LEGACY_SYSTEM_PROMPT = """You are an AI Legacy Letter composer for GriefCart. Your role is to transform a person's thoughts, wishes, and financial instructions into a beautiful, dignified, deeply personal legacy document.

The document should:
- Open with a warm, personal greeting addressed to specific trusted persons by name
- Weave the person's own words verbatim where given — don't paraphrase personal messages
- Provide clear, numbered financial instructions so nothing is overlooked
- Include specific instructions for digital accounts and assets
- Close with meaningful final words that capture their voice and values
- Have a warm but dignified tone — not legalistic, not cold, not overly formal

Write in first person as if the person is speaking directly to their loved ones.
Structure with clear sections: Personal Messages, Financial Instructions, Digital Life, Funeral Preferences, Final Words."""


def generate_legacy(answers: dict) -> str:
    personal_messages = answers.get("personalMessages", [])
    recipients = [m.get("name", "My loved one") for m in personal_messages if m.get("name")]

    greeting = f"To {', '.join(recipients[:-1]) + ' and ' + recipients[-1] if len(recipients) > 1 else recipients[0] if recipients else 'My Loved Ones'}"

    prompt = f"""Create a heartfelt legacy letter/document from these personal answers.

Opening: "{greeting}"

Personal Messages to Loved Ones:
{json.dumps(personal_messages, default=str, indent=2) if personal_messages else "No specific personal messages provided"}

Financial Wishes and Instructions:
{answers.get('financialWishes', 'Not specified')}

Funeral and Memorial Preferences:
{answers.get('funeralPreferences', 'Not specified')}

Digital Life Instructions (accounts, passwords, subscriptions to cancel):
{answers.get('digitalLegacy', 'Not specified')}

Final Words:
{answers.get('finalWords', 'Not specified')}

Additional Notes:
{answers.get('additionalNotes', '')}

Write a complete, beautiful legacy document. It should feel like a personal letter, not a legal document. Include all the specific financial and practical instructions clearly, but woven into a warm and personal narrative. This document will be treasured by the family."""

    return call_llm(
        [{"role": "user", "content": prompt}],
        system=LEGACY_SYSTEM_PROMPT,
        max_tokens=3000,
        temperature=0.8,
    )


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
            "additionalNotes": body.get("additionalNotes", ""),
            "updatedAt": now,
            "completedAt": now if body.get("status") == "complete" else body.get("completedAt"),
        }
        TABLE.put_item(Item=item)
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
                return respond(400, {"error": "No legacy answers found. Save your answers first."})
            legacy_id = items[0]["legacyId"]

        answers_resp = TABLE.get_item(Key={"legacyId": legacy_id})
        answers = answers_resp.get("Item")
        if not answers:
            return respond(404, {"error": "Legacy answers not found"})

        content = generate_legacy(answers)
        if not content:
            return respond(500, {"error": "Failed to generate legacy letter. Please try again."})

        # Store in S3 encrypted
        doc_id = str(uuid.uuid4())
        s3_key = f"legacy/{user_id}/{doc_id}.txt"
        try:
            s3.put_object(
                Bucket=DOC_BUCKET,
                Key=s3_key,
                Body=content.encode("utf-8"),
                ContentType="text/plain",
                ServerSideEncryption="aws:kms",
                SSEKMSKeyId=os.environ.get("KMS_KEY_ID", ""),
                Metadata={
                    "user-id": user_id,
                    "legacy-id": legacy_id,
                    "type": "legacy-letter",
                    "generated-by": os.environ.get("LLM_PROVIDER", "bedrock"),
                },
            )
        except Exception as e:
            print(f"S3 store error (non-fatal): {e}")

        # Update legacy record with generated content preview
        try:
            TABLE.update_item(
                Key={"legacyId": legacy_id},
                UpdateExpression="SET #st = :status, documentId = :docId, generatedAt = :ts",
                ExpressionAttributeNames={"#st": "status"},
                ExpressionAttributeValues={
                    ":status": "generated",
                    ":docId": doc_id,
                    ":ts": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as e:
            print(f"DynamoDB update error (non-fatal): {e}")

        return respond(200, {
            "documentId": doc_id,
            "legacyId": legacy_id,
            "content": content,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "version": 1,
            "provider": os.environ.get("LLM_PROVIDER", "bedrock"),
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
