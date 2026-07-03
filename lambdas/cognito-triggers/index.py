import json, os, time, boto3
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
users_table = dynamodb.Table(os.environ["USERS_TABLE"])

def lambda_handler(event, context):
    trigger = event.get("triggerSource", "")

    if "PostConfirmation" in trigger:
        user = event["request"]["userAttributes"]
        item = {
            "userId": event["userName"],
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "lastLoginAt": datetime.now(timezone.utc).isoformat(),
            "loginCount": 1,
            "continuityScore": None,
            "twinStatus": "pending",
            "tier": "free",
            "mfaEnabled": user.get("cognito:mfa_enabled", "false") == "true",
        }
        email = user.get("email", "")
        if email:
            item["email"] = email
        users_table.put_item(Item=item, ConditionExpression="attribute_not_exists(userId)")
        return event

    if "PostAuthentication" in trigger:
        user_id = event["userName"]
        if users_table.get_item(Key={"userId": user_id}).get("Item"):
            users_table.update_item(
                Key={"userId": user_id},
                UpdateExpression="SET lastLoginAt = :now ADD loginCount :one",
                ExpressionAttributeValues={
                    ":now": datetime.now(timezone.utc).isoformat(),
                    ":one": 1,
                },
            )
        return event

    if "PreAuthentication" in trigger:
        return event

    return event
