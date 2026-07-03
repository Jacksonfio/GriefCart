import json, os, uuid, boto3
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
sns = boto3.client("sns")
ses = boto3.client("ses")

TABLE = dynamodb.Table(os.environ["TRUSTED_PERSONS_TABLE"])
USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])
SNS_TOPIC = os.environ["SNS_TOPIC_ARN"]
SES_SOURCE = os.environ.get("SES_SOURCE_EMAIL", "jacksonjp646@gmail.com")

def lambda_handler(event, context):
    http = event.get("httpMethod", "GET")
    path = event.get("path", "")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")

    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    if http == "GET" and path == "/trusted-persons":
        resp = TABLE.query(
            IndexName="userId-index",
            KeyConditionExpression="userId = :uid",
            ExpressionAttributeValues={":uid": user_id},
        )
        persons = resp.get("Items", [])
        for p in persons:
            if "phone" in p:
                p["phone"] = mask_phone(p["phone"])
        return respond(200, {"trustedPersons": persons})

    if http == "POST" and path == "/trusted-persons":
        body = json.loads(event.get("body", "{}"))
        person_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        item = {
            "personId": person_id,
            "userId": user_id,
            "name": body.get("name", ""),
            "email": body.get("email", ""),
            "phone": body.get("phone", ""),
            "relationship": body.get("relationship", ""),
            "priority": body.get("priority", 1),
            "accessLevel": body.get("accessLevel", "emergency"),
            "verificationStatus": "pending",
            "invitedAt": now,
            "createdAt": now,
            "canViewDocuments": body.get("canViewDocuments", False),
            "canContactInstitutions": body.get("canContactInstitutions", False),
            "legalDocumentId": body.get("legalDocumentId", ""),
        }
        TABLE.put_item(Item=item)

        if body.get("email"):
            send_invite(item, user_id)

        return respond(200, {"personId": person_id, "status": "invited"})

    if http == "PUT" and path.startswith("/trusted-persons/"):
        person_id = path.split("/trusted-persons/")[1]
        body = json.loads(event.get("body", "{}"))
        TABLE.update_item(
            Key={"personId": person_id},
            UpdateExpression="SET #n = :n, email = :e, phone = :p, relationship = :r, priority = :pr, accessLevel = :al, canViewDocuments = :cvd, canContactInstitutions = :cci",
            ExpressionAttributeNames={"#n": "name"},
            ExpressionAttributeValues={
                ":n": body.get("name"), ":e": body.get("email"), ":p": body.get("phone"),
                ":r": body.get("relationship"), ":pr": body.get("priority", 1),
                ":al": body.get("accessLevel", "emergency"),
                ":cvd": body.get("canViewDocuments", False),
                ":cci": body.get("canContactInstitutions", False),
            },
        )
        return respond(200, {"updated": person_id})

    if http == "DELETE" and path.startswith("/trusted-persons/"):
        person_id = path.split("/trusted-persons/")[1]
        TABLE.delete_item(Key={"personId": person_id})
        return respond(200, {"deleted": person_id})

    return respond(404, {"error": "Not found"})

def send_invite(person, user_id):
    try:
        ses.send_email(
            Source=SES_SOURCE,
            Destination={"ToAddresses": [person["email"]]},
            Message={
                "Subject": {"Data": f"You've been added as a Trusted Person on GriefCart"},
                "Body": {"Html": {"Data": f"""<html><body style="font-family: system-ui; max-width: 600px; margin: 40px auto;">
<h2 style="color: #059669;">You're a Trusted Person</h2>
<p>{person.get('name')} has added you as a trusted person on GriefCart.</p>
<p><strong>Your role:</strong> {person.get('relationship', 'Trusted contact')}</p>
<p><strong>Access level:</strong> {person.get('accessLevel', 'emergency')}</p>
<hr>
<p style="color: #666; font-size: 14px;">GriefCart helps ensure financial continuity. You'll be notified if action is needed.</p>
</body></html>"""}}},
        )
    except Exception as e:
        print(f"Failed to send invite email: {e}")
    try:
        sns.publish(TopicArn=SNS_TOPIC, Message=f"{person.get('name')} added as trusted person", Subject="GriefCart Trusted Person")
    except Exception as e:
        print(f"Failed to publish SNS: {e}")

def mask_phone(phone):
    if len(phone) > 4:
        return "*" * (len(phone) - 4) + phone[-4:]
    return phone

def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization"},
        "body": json.dumps(body, default=str),
    }
