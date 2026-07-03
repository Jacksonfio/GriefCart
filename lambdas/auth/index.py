import json, os, boto3, uuid, hmac, hashlib, base64
from datetime import datetime, timezone, timedelta

cognito = boto3.client("cognito-idp")
dynamodb = boto3.resource("dynamodb")

USER_POOL_ID = os.environ["COGNITO_USER_POOL_ID"]
CLIENT_ID = os.environ["COGNITO_CLIENT_ID"]
USERS_TABLE = dynamodb.Table(os.environ["USERS_TABLE"])

def lambda_handler(event, context):
    http = event.get("httpMethod", "GET")
    path = event.get("path", "")

    if http == "POST" and "/auth/demo" in path:
        return handle_demo_login(event)

    if http == "GET" and "/auth/me" in path:
        return handle_get_profile(event)

    if http == "POST" and "/auth/login" in path:
        return handle_login(event)

    if http == "POST" and "/auth/register" in path:
        return handle_register(event)

    return respond(404, {"error": "Not found"})

def handle_demo_login(event):
    try:
        resp = cognito.admin_initiate_auth(
            UserPoolId=USER_POOL_ID,
            ClientId=CLIENT_ID,
            AuthFlow="ADMIN_USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": "Jacksonfio",
                "PASSWORD": "Jacksonfio@942",
            },
        )
        auth_result = resp.get("AuthenticationResult", {})
        id_token = auth_result.get("IdToken", "")
        access_token = auth_result.get("AccessToken", "")

        user_info = cognito.get_user(AccessToken=access_token)
        user_attrs = {attr["Name"]: attr["Value"] for attr in user_info.get("UserAttributes", [])}

        return respond(200, {
            "token": id_token,
            "userId": user_attrs.get("sub", ""),
            "email": user_attrs.get("email", ""),
            "name": user_attrs.get("name", ""),
        })
    except Exception as e:
        return respond(500, {"error": f"Demo login failed: {str(e)}"})

def handle_get_profile(event):
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    resp = USERS_TABLE.get_item(Key={"userId": user_id})
    user = resp.get("Item", {})

    return respond(200, {
        "userId": user_id,
        "email": claims.get("email", ""),
        "name": claims.get("name", ""),
        "createdAt": user.get("createdAt", ""),
        "lastLoginAt": user.get("lastLoginAt", ""),
        "loginCount": user.get("loginCount", 0),
        "continuityScore": user.get("continuityScore"),
        "twinStatus": user.get("twinStatus", "pending"),
        "mfaEnabled": user.get("mfaEnabled", False),
    })

def handle_login(event):
    try:
        body = json.loads(event.get("body", "{}"))
        email = body.get("email", "")
        password = body.get("password", "")

        resp = cognito.admin_initiate_auth(
            UserPoolId=USER_POOL_ID,
            ClientId=CLIENT_ID,
            AuthFlow="ADMIN_USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": email, "PASSWORD": password},
        )
        auth_result = resp.get("AuthenticationResult", {})
        id_token = auth_result.get("IdToken", "")
        access_token = auth_result.get("AccessToken", "")

        user_info = cognito.get_user(AccessToken=access_token)
        user_attrs = {attr["Name"]: attr["Value"] for attr in user_info.get("UserAttributes", [])}

        return respond(200, {
            "token": id_token,
            "userId": user_attrs.get("sub", ""),
            "email": user_attrs.get("email", ""),
            "name": user_attrs.get("name", ""),
        })
    except cognito.exceptions.NotAuthorizedException:
        return respond(401, {"error": "Invalid email or password"})
    except Exception as e:
        return respond(500, {"error": f"Login failed: {str(e)}"})

def handle_register(event):
    try:
        body = json.loads(event.get("body", "{}"))
        email = body.get("email", "")
        password = body.get("password", "")
        name = body.get("name", "")

        resp = cognito.sign_up(
            ClientId=CLIENT_ID,
            Username=email,
            Password=password,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "name", "Value": name},
            ],
        )

        cognito.admin_confirm_sign_up(
            UserPoolId=USER_POOL_ID,
            Username=email,
        )

        auth_resp = cognito.admin_initiate_auth(
            UserPoolId=USER_POOL_ID,
            ClientId=CLIENT_ID,
            AuthFlow="ADMIN_USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": email, "PASSWORD": password},
        )
        auth_result = auth_resp.get("AuthenticationResult", {})
        id_token = auth_result.get("IdToken", "")

        return respond(200, {
            "token": id_token,
            "userId": resp.get("UserSub", ""),
            "email": email,
            "name": name,
        })
    except cognito.exceptions.UsernameExistsException:
        return respond(409, {"error": "An account with this email already exists"})
    except Exception as e:
        return respond(500, {"error": f"Registration failed: {str(e)}"})

def respond(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body, default=str),
    }
