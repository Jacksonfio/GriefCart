import json, os, boto3

dynamodb = boto3.resource("dynamodb")
sqs = boto3.client("sqs")

USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
DOCS_TABLE = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])
TWIN_TABLE = dynamodb.Table(os.environ["FINANCIAL_TWIN_TABLE"])

def process_sync(event):
    for record in event.get("Records", []):
        body = json.loads(record.get("body", "{}"))
        action = body.get("action", "")
        user_id = body.get("userId", "")
        twin_id = body.get("twinId", "")

        if action == "sync_twin":
            twin_resp = TWIN_TABLE.get_item(Key={"twinId": twin_id})
            twin = twin_resp.get("Item", {})
            USERS_TABLE.update_item(
                Key={"userId": user_id},
                UpdateExpression="SET twinStatus = :s, lastTwinSync = :t",
                ExpressionAttributeValues={
                    ":s": "synced",
                    ":t": twin.get("generatedAt", ""),
                },
            )
            print(f"Synced twin {twin_id} for user {user_id}")

def lambda_handler(event, context):
    if event.get("Records"):
        process_sync(event)
        return {"statusCode": 200, "body": json.dumps({"synced": len(event["Records"])})}
    return {"statusCode": 200, "body": json.dumps({"message": "No records"})}
