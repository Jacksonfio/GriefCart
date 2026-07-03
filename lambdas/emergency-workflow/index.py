import json, os, boto3
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
stepfunctions = boto3.client("stepfunctions")

USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
TRUSTED_TABLE = dynamodb.Table(os.environ["TRUSTED_PERSONS_TABLE"])
PLANS_TABLE = dynamodb.Table(os.environ["CONTINUITY_PLANS_TABLE"])
STATE_MACHINE_ARN = os.environ.get("STATE_MACHINE_ARN", "")

def lambda_handler(event, context):
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")
    path = event.get("path", "")
    http = event.get("httpMethod", "GET")

    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    if http == "POST" and "/emergency/activate" in path:
        body = json.loads(event.get("body", "{}"))
        trusted_code = body.get("code", "")

        trusted_resp = TRUSTED_TABLE.query(
            IndexName="userId-index",
            KeyConditionExpression="userId = :uid",
            ExpressionAttributeValues={":uid": user_id},
        )
        persons = trusted_resp.get("Items", [])
        verified = [p for p in persons if p.get("verificationStatus") == "verified"]

        if not verified:
            return respond(400, {"error": "No verified trusted persons. Add and verify trusted persons first."})

        if STATE_MACHINE_ARN:
            stepfunctions.start_execution(
                stateMachineArn=STATE_MACHINE_ARN,
                input=json.dumps({
                    "userId": user_id,
                    "trustedPersonId": verified[0].get("personId"),
                    "accessLevel": verified[0].get("accessLevel", "emergency"),
                    "triggeredAt": datetime.now(timezone.utc).isoformat(),
                }),
            )

        return respond(200, {
            "status": "emergency_activated",
            "message": "Emergency workflow started. Trusted persons will be notified.",
            "notifiedPersons": len(verified),
        })

    if http == "GET" and "/emergency/status" in path:
        trusted_resp = TRUSTED_TABLE.query(
            IndexName="userId-index",
            KeyConditionExpression="userId = :uid",
            ExpressionAttributeValues={":uid": user_id},
        )
        persons = trusted_resp.get("Items", [])
        verified = [p for p in persons if p.get("verificationStatus") == "verified"]

        plan_resp = PLANS_TABLE.query(
            IndexName="userId-index",
            KeyConditionExpression="userId = :uid",
            ExpressionAttributeValues={":uid": user_id},
        )
        plans = plan_resp.get("Items", [])

        return respond(200, {
            "verifiedTrustedPersons": len(verified),
            "totalTrustedPersons": len(persons),
            "hasContinuityPlan": len(plans) > 0,
            "emergencyReady": len(verified) >= 2 and len(plans) > 0,
        })

    return respond(404, {"error": "Not found"})

def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=str),
    }
