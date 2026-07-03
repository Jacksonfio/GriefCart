import json, os, uuid, boto3, base64
from datetime import datetime, timezone, timedelta

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
kms = boto3.client("kms")

BUCKET = os.environ["DOCUMENT_BUCKET"]
TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
KMS_KEY = os.environ.get("KMS_KEY_ID", "")

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "text/csv": "csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}
MAX_FILE_SIZE = 50 * 1024 * 1024

def generate_presigned_url(document_id, user_id, s3_key):
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET, "Key": s3_key},
        ExpiresIn=3600,
    )
    return url

def lambda_handler(event, context):
    http = event.get("httpMethod", "POST")
    path = event.get("path", "")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if http == "POST" and "/upload" in path:
        body = json.loads(event.get("body", "{}"))
        file_name = body.get("fileName", "document")
        content_type = body.get("contentType", "application/pdf")
        file_data = base64.b64decode(body.get("fileData", ""))
        category = body.get("category", "uncategorized")

        if content_type not in ALLOWED_TYPES:
            return respond(400, {"error": f"Unsupported file type: {content_type}"})
        if len(file_data) > MAX_FILE_SIZE:
            return respond(400, {"error": "File exceeds 50MB limit"})

        document_id = str(uuid.uuid4())
        ext = ALLOWED_TYPES[content_type]
        s3_key = f"{user_id}/{document_id}/{file_name}"

        s3.put_object(
            Bucket=BUCKET,
            Key=s3_key,
            Body=file_data,
            ContentType=content_type,
            ServerSideEncryption="aws:kms",
            SSEKMSKeyId=KMS_KEY,
            Metadata={
                "user-id": user_id,
                "document-id": document_id,
                "category": category,
            },
        )

        TABLE.put_item(
            Item={
                "documentId": document_id,
                "userId": user_id,
                "fileName": file_name,
                "fileType": ext,
                "category": category,
                "size": len(file_data),
                "s3Key": s3_key,
                "uploadedAt": datetime.now(timezone.utc).isoformat(),
                "encrypted": True,
                "kmsKeyId": KMS_KEY,
                "versionId": "1",
            }
        )

        return respond(200, {"documentId": document_id, "fileName": file_name, "size": len(file_data)})

    if http == "GET" and path.startswith("/documents/") and "/upload" not in path:
        document_id = path.split("/documents/")[1].split("/")[0]
        resp = TABLE.get_item(Key={"documentId": document_id})
        doc = resp.get("Item")
        if not doc or doc["userId"] != user_id:
            return respond(404, {"error": "Document not found"})
        url = generate_presigned_url(document_id, user_id, doc["s3Key"])
        doc["presignedUrl"] = url
        doc.pop("s3Key", None)
        return respond(200, doc)

    if http == "GET" and path == "/documents":
        resp = TABLE.query(
            IndexName="userId-index",
            KeyConditionExpression="userId = :uid",
            ExpressionAttributeValues={":uid": user_id},
        )
        docs = resp.get("Items", [])
        for d in docs:
            d.pop("s3Key", None)
        return respond(200, {"documents": docs, "count": len(docs)})

    if http == "DELETE" and path.startswith("/documents/"):
        document_id = path.split("/documents/")[1].split("/")[0]
        resp = TABLE.get_item(Key={"documentId": document_id})
        doc = resp.get("Item")
        if not doc or doc["userId"] != user_id:
            return respond(404, {"error": "Document not found"})
        s3.delete_object(Bucket=BUCKET, Key=doc["s3Key"])
        TABLE.delete_item(Key={"documentId": document_id})
        return respond(200, {"deleted": document_id})

    return respond(404, {"error": "Not found"})


def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization"},
        "body": json.dumps(body, default=str),
    }
