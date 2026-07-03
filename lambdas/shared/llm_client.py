"""
Shared LLM Client for GriefCart
Supports:
  - AWS Bedrock (Meta Llama 3, Mistral) — default, uses open-source HuggingFace-originating models
  - HuggingFace Inference API            — direct HF endpoint fallback
  - Google Gemini                         — legacy fallback

Environment Variables:
  LLM_PROVIDER          : "bedrock" | "huggingface" | "gemini"  (default: bedrock)
  BEDROCK_MODEL_ID      : Bedrock model ARN/ID                   (default: meta.llama3-70b-instruct-v1:0)
  HF_MODEL_ID           : HuggingFace model name                 (default: meta-llama/Llama-3.1-8B-Instruct)
  HF_API_KEY_SECRET     : SecretsManager secret name for HF token
  GEMINI_API_KEY_SECRET : SecretsManager secret name for Gemini key (legacy)
"""

import json
import os
import time
import urllib.request
import urllib.error
import boto3
import logging

logger = logging.getLogger(__name__)

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "bedrock").lower()

# Bedrock config — Meta Llama 3 70B Instruct (open-source, from HuggingFace lineage)
BEDROCK_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "meta.llama3-70b-instruct-v1:0"
)

# HuggingFace Inference API config
HF_MODEL_ID = os.environ.get(
    "HF_MODEL_ID", "meta-llama/Llama-3.1-8B-Instruct"
)
HF_API_BASE = "https://api-inference.huggingface.co/models"

_bedrock_client = None
_secretsmanager_client = None


def _get_bedrock():
    global _bedrock_client
    if _bedrock_client is None:
        _bedrock_client = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _bedrock_client


def _get_secrets():
    global _secretsmanager_client
    if _secretsmanager_client is None:
        _secretsmanager_client = boto3.client("secretsmanager")
    return _secretsmanager_client


def _get_secret(secret_id: str) -> str:
    """Retrieve a secret value from AWS Secrets Manager."""
    resp = _get_secrets().get_secret_value(SecretId=secret_id)
    return resp["SecretString"].strip()


# ─── Bedrock (Llama 3 / Mistral) ─────────────────────────────────────────────

def _call_bedrock(
    messages: list,
    system: str | None = None,
    max_tokens: int = 1000,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str:
    """
    Call AWS Bedrock with the configured model (default: Meta Llama 3 70B).
    The model must be enabled in your AWS account's Bedrock console.
    """
    model_id = BEDROCK_MODEL_ID
    client = _get_bedrock()

    # Build the system prompt
    system_msg = system or "You are a helpful AI assistant for GriefCart, an AI Financial Continuity platform."
    if json_mode:
        system_msg += "\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no explanations outside the JSON."

    # Detect model family and format payload accordingly
    if "llama3" in model_id or "llama-3" in model_id.lower():
        body = _build_llama3_payload(messages, system_msg, max_tokens, temperature)
    elif "mistral" in model_id.lower():
        body = _build_mistral_payload(messages, system_msg, max_tokens, temperature)
    elif "anthropic" in model_id.lower() or "claude" in model_id.lower():
        body = _build_claude_payload(messages, system_msg, max_tokens, temperature)
    else:
        # Default: use Llama 3 format
        body = _build_llama3_payload(messages, system_msg, max_tokens, temperature)

    max_retries = 4
    for attempt in range(max_retries + 1):
        try:
            resp = client.invoke_model(
                modelId=model_id,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            )
            resp_body = json.loads(resp["body"].read())
            return _extract_bedrock_text(resp_body, model_id)
        except client.exceptions.ThrottlingException:
            if attempt < max_retries:
                wait = 2 ** attempt
                logger.warning(f"Bedrock throttled, retrying in {wait}s (attempt {attempt + 1})")
                time.sleep(wait)
                continue
            logger.error("Bedrock max retries reached due to throttling")
            return ""
        except Exception as e:
            logger.error(f"Bedrock error: {e}")
            return ""
    return ""


def _build_llama3_payload(messages, system, max_tokens, temperature):
    """Build payload for Meta Llama 3 on Bedrock."""
    # Llama 3 uses a specific prompt format
    prompt_parts = [f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n{system}<|eot_id|>"]
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        prompt_parts.append(f"<|start_header_id|>{role}<|end_header_id|>\n{content}<|eot_id|>")
    prompt_parts.append("<|start_header_id|>assistant<|end_header_id|>")
    prompt = "\n".join(prompt_parts)

    return {
        "prompt": prompt,
        "max_gen_len": max_tokens,
        "temperature": temperature,
        "top_p": 0.9,
    }


def _build_mistral_payload(messages, system, max_tokens, temperature):
    """Build payload for Mistral models on Bedrock."""
    # Mistral uses instruction format
    conversation = f"<s>[INST] {system}\n\n"
    for i, msg in enumerate(messages):
        content = msg.get("content", "")
        role = msg.get("role", "user")
        if role == "user":
            if i == 0:
                conversation += content + " [/INST]"
            else:
                conversation += f"[INST] {content} [/INST]"
        else:
            conversation += f" {content} </s>"
    return {
        "prompt": conversation,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": 0.9,
    }


def _build_claude_payload(messages, system, max_tokens, temperature):
    """Build payload for Anthropic Claude on Bedrock (fallback)."""
    return {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system,
        "messages": [{"role": m.get("role", "user"), "content": m.get("content", "")} for m in messages],
    }


def _extract_bedrock_text(resp_body: dict, model_id: str) -> str:
    """Extract text from varied Bedrock response shapes."""
    # Llama 3
    if "generation" in resp_body:
        return resp_body["generation"].strip()
    # Mistral
    if "outputs" in resp_body:
        outputs = resp_body["outputs"]
        if outputs:
            return outputs[0].get("text", "").strip()
    # Claude
    if "content" in resp_body:
        content = resp_body["content"]
        if content and isinstance(content, list):
            return content[0].get("text", "").strip()
    # Generic completion
    if "completions" in resp_body:
        completions = resp_body["completions"]
        if completions:
            return completions[0].get("data", {}).get("text", "").strip()
    # Fallback: try common keys
    for key in ("text", "response", "answer", "result"):
        if key in resp_body:
            return str(resp_body[key]).strip()
    logger.error(f"Unknown Bedrock response shape: {list(resp_body.keys())}")
    return ""


# ─── HuggingFace Inference API ────────────────────────────────────────────────

def _call_huggingface(
    messages: list,
    system: str | None = None,
    max_tokens: int = 1000,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str:
    """
    Call HuggingFace Inference API directly.
    Requires HF_API_KEY_SECRET env var pointing to a secret with your HF token.
    """
    hf_secret = os.environ.get("HF_API_KEY_SECRET", "")
    if not hf_secret:
        logger.error("HF_API_KEY_SECRET not set")
        return ""

    try:
        api_key = _get_secret(hf_secret)
    except Exception as e:
        logger.error(f"Failed to get HF API key: {e}")
        return ""

    system_msg = system or "You are a helpful AI assistant."
    if json_mode:
        system_msg += "\n\nRespond with valid JSON only."

    # Build chat messages in HF format
    chat_messages = [{"role": "system", "content": system_msg}]
    chat_messages.extend(messages)

    body = {
        "model": HF_MODEL_ID,
        "messages": chat_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }

    url = "https://api-inference.huggingface.co/v1/chat/completions"
    max_retries = 4
    for attempt in range(max_retries + 1):
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(body).encode(),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
            )
            resp_data = json.loads(urllib.request.urlopen(req, timeout=60).read())
            choices = resp_data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "").strip()
            return ""
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < max_retries:
                wait = 2 ** attempt
                logger.warning(f"HF API rate limited, retrying in {wait}s")
                time.sleep(wait)
                continue
            logger.error(f"HF API error {e.code}: {e.read().decode()[:200]}")
            return ""
        except Exception as e:
            logger.error(f"HF API error: {e}")
            return ""
    return ""


# ─── Gemini Legacy Fallback ───────────────────────────────────────────────────

def _call_gemini(
    messages: list,
    system: str | None = None,
    max_tokens: int = 1000,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str:
    """Legacy Gemini fallback for backwards compatibility."""
    gemini_secret = os.environ.get("GEMINI_API_KEY_SECRET", "")
    if not gemini_secret:
        return ""
    try:
        api_key = _get_secret(gemini_secret)
    except Exception as e:
        logger.error(f"Gemini key error: {e}")
        return ""

    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    body = {
        "contents": [{"parts": [{"text": m["content"]}]} for m in messages],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }
    if json_mode:
        body["generationConfig"]["response_mime_type"] = "application/json"
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    max_retries = 4
    for attempt in range(max_retries + 1):
        try:
            req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json"},
            )
            resp_data = json.loads(urllib.request.urlopen(req, timeout=60).read())
            candidates = resp_data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "")
            return ""
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            logger.error(f"Gemini error {e.code}: {e.read().decode()[:200]}")
            return ""
    return ""


# ─── Public API ──────────────────────────────────────────────────────────────

def call_llm(
    messages: list,
    system: str | None = None,
    max_tokens: int = 1000,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str:
    """
    Universal LLM caller. Routes to the configured provider.

    Args:
        messages:    List of {"role": "user"|"assistant", "content": "..."}
        system:      System prompt (optional)
        max_tokens:  Max output tokens
        temperature: Sampling temperature (0.0–1.0)
        json_mode:   If True, instructs model to return JSON

    Returns:
        str: The model's text response, or "" on failure.
    """
    provider = LLM_PROVIDER
    logger.info(f"Calling LLM provider: {provider}")

    if provider == "bedrock":
        result = _call_bedrock(messages, system, max_tokens, temperature, json_mode)
        # Fallback chain: bedrock → huggingface → gemini
        if not result:
            logger.warning("Bedrock returned empty, trying HuggingFace fallback")
            result = _call_huggingface(messages, system, max_tokens, temperature, json_mode)
        if not result:
            logger.warning("HuggingFace returned empty, trying Gemini fallback")
            result = _call_gemini(messages, system, max_tokens, temperature, json_mode)

    elif provider == "huggingface":
        result = _call_huggingface(messages, system, max_tokens, temperature, json_mode)
        if not result:
            logger.warning("HuggingFace returned empty, trying Bedrock fallback")
            result = _call_bedrock(messages, system, max_tokens, temperature, json_mode)
        if not result:
            logger.warning("Bedrock returned empty, trying Gemini fallback")
            result = _call_gemini(messages, system, max_tokens, temperature, json_mode)

    elif provider == "gemini":
        result = _call_gemini(messages, system, max_tokens, temperature, json_mode)
        if not result:
            logger.warning("Gemini returned empty, trying Bedrock fallback")
            result = _call_bedrock(messages, system, max_tokens, temperature, json_mode)

    else:
        logger.error(f"Unknown LLM_PROVIDER: {provider}, defaulting to Bedrock")
        result = _call_bedrock(messages, system, max_tokens, temperature, json_mode)

    return result or ""
