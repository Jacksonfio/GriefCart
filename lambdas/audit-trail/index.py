import json, os, boto3
from datetime import datetime, timezone, timedelta

cloudtrail = boto3.client("cloudtrail")

AUDIT_BUCKET = os.environ.get("AUDIT_LOG_BUCKET", "")

def lambda_handler(event, context):
    http = event.get("httpMethod", "GET")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")
    query_params = event.get("queryStringParameters", {}) or {}

    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    days = int(query_params.get("days", 7))
    start_time = datetime.now(timezone.utc) - timedelta(days=days)

    try:
        resp = cloudtrail.lookup_events(
            LookupAttributes=[
                {"AttributeKey": "ResourceName", "AttributeValue": user_id},
            ],
            StartTime=start_time,
            MaxResults=50,
        )
        events = resp.get("Events", [])
    except Exception as e:
        events = [{"error": str(e)}]

    formatted = []
    for e in events:
        formatted.append({
            "eventId": e.get("EventId"),
            "eventName": e.get("EventName"),
            "eventTime": e.get("EventTime").isoformat() if e.get("EventTime") else "",
            "source": e.get("EventSource"),
            "resources": [r.get("ResourceName") for r in e.get("Resources", [])],
        })

    return respond(200, {
        "events": formatted,
        "count": len(formatted),
        "periodDays": days,
    })

def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=str),
    }
