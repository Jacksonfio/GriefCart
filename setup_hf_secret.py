"""
Setup script: Store HuggingFace API token in AWS Secrets Manager
Run this ONCE before deploying if you want to use HuggingFace as your AI provider.

Usage:
  python setup_hf_secret.py --token hf_yourTokenHere

Requirements:
  pip install boto3
  AWS credentials configured (aws configure)
"""

import argparse
import json
import boto3
import sys

def create_hf_secret(token: str, env: str = "dev", region: str = "us-east-1") -> str:
    client = boto3.client("secretsmanager", region_name=region)
    secret_name = f"griefcart/{env}/hf-api-key"

    try:
        # Try to update existing secret
        resp = client.update_secret(
            SecretId=secret_name,
            SecretString=token,
        )
        print(f"✅ Updated existing secret: {secret_name}")
        arn = client.describe_secret(SecretId=secret_name)["ARN"]
    except client.exceptions.ResourceNotFoundException:
        # Create new secret
        resp = client.create_secret(
            Name=secret_name,
            Description="HuggingFace API token for GriefCart AI features",
            SecretString=token,
            Tags=[
                {"Key": "Project", "Value": "griefcart"},
                {"Key": "Environment", "Value": env},
                {"Key": "Purpose", "Value": "hf-api-key"},
            ],
        )
        arn = resp["ARN"]
        print(f"✅ Created new secret: {secret_name}")

    print(f"\n📋 Secret ARN: {arn}")
    print(f"\nAdd this to your samconfig.toml or SAM deploy command:")
    print(f"  HuggingFaceApiKeySecretArn='{arn}'")
    print(f"\nOr set in .env:")
    print(f"  HF_API_KEY_SECRET={arn}")
    return arn


def enable_bedrock_models(region: str = "us-east-1"):
    """Print instructions for enabling Bedrock models."""
    print("\n" + "="*60)
    print("📦 AWS Bedrock Model Access Setup")
    print("="*60)
    print(f"\n1. Go to: https://console.aws.amazon.com/bedrock/home?region={region}#/modelaccess")
    print("\n2. Click 'Manage model access'")
    print("\n3. Enable these open-source models:")
    print("   ✓ Meta Llama 3 70B Instruct  (meta.llama3-70b-instruct-v1:0) — Recommended")
    print("   ✓ Meta Llama 3 8B Instruct   (meta.llama3-8b-instruct-v1:0)  — Faster/cheaper")
    print("   ✓ Mistral 7B Instruct        (mistral.mistral-7b-instruct-v0:2)")
    print("\n4. Submit the access request (usually instant for open-source models)")
    print("\n5. Redeploy your SAM stack — Bedrock will now work automatically!")
    print("\nNote: Bedrock model access is FREE for the first invocation tier.")
    print("      Pricing: ~$0.0008/1K tokens for Llama 3 8B, ~$0.0026 for Llama 3 70B")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Setup GriefCart AI provider secrets")
    parser.add_argument("--token", help="HuggingFace API token (hf_...)")
    parser.add_argument("--env", default="dev", help="Environment name (default: dev)")
    parser.add_argument("--region", default="us-east-1", help="AWS region (default: us-east-1)")
    parser.add_argument("--bedrock-info", action="store_true", help="Show Bedrock setup instructions")
    args = parser.parse_args()

    if args.bedrock_info:
        enable_bedrock_models(args.region)
        sys.exit(0)

    if not args.token:
        print("❌ Error: --token is required")
        print("\nGet your HuggingFace token at: https://huggingface.co/settings/tokens")
        print("Usage: python setup_hf_secret.py --token hf_yourTokenHere")
        print("\nTo see Bedrock setup instructions:")
        print("  python setup_hf_secret.py --bedrock-info")
        sys.exit(1)

    if not args.token.startswith("hf_"):
        print("⚠️  Warning: Token doesn't start with 'hf_' — are you sure it's a HuggingFace token?")

    arn = create_hf_secret(args.token, args.env, args.region)
    enable_bedrock_models(args.region)
