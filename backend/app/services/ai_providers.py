"""
AI provider layer — one interface, two interchangeable backends.

- "gemini":        Google Gemini API (google-genai SDK).
- "openai_compat": any OpenAI-compatible endpoint (OpenRouter, Groq, Mistral, ...).

The active provider is chosen via AI_PROVIDER in config. All generation /
verification logic lives in generation_service.py and is identical for both
backends — a provider only has to turn a prompt into a parsed Pydantic model.

Every provider call is wrapped in transient-error retry (429 rate limits,
5xx overload, timeouts) with exponential backoff + jitter, so short-lived
quota spikes and "high demand" 503s self-heal instead of failing the request.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from typing import Awaitable, Callable, Optional, Type, TypeVar

from pydantic import BaseModel, ValidationError

from app.config import (
    AI_MAX_CONCURRENCY,
    AI_MAX_RETRIES,
    AI_PROVIDER,
    AI_RETRY_BASE_DELAY,
    AI_RETRY_MAX_WAIT,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    OPENAI_COMPAT_API_KEY,
    OPENAI_COMPAT_BASE_URL,
    OPENAI_COMPAT_FALLBACK_MODELS,
    OPENAI_COMPAT_MODEL,
)

logger = logging.getLogger("newswire.providers")

T = TypeVar("T", bound=BaseModel)

_TRANSIENT_STATUS_CODES = {429, 500, 502, 503, 504}
_TRANSIENT_STATUS_NAMES = {
    "UNAVAILABLE",
    "RESOURCE_EXHAUSTED",
    "INTERNAL",
    "DEADLINE_EXCEEDED",
    "CANCELED",
}
# Matches error payloads whose `code` field carries an HTTP-style status, e.g.
# Gemini's ServerError str: "ServerError: 503 ... {'error': {'code': 503, ...}}"
_TRANSIENT_TEXT_RE = re.compile(r"['\"]?code['\"]?\s*[:=]\s*(429|50[0234])\b")

# Text markers suggesting the endpoint/model rejected the strict JSON-schema
# response_format (→ fall back to plain JSON mode instead of failing).
_SCHEMA_UNSUPPORTED_MARKERS = (
    "response_format",
    "json_schema",
    "structured output",
    "json mode",
)

# Cached across calls, per model: True = structured output accepted,
# False = endpoint rejected schemas (→ JSON mode), absent = not tried yet.
_schema_supported: dict[str, Optional[bool]] = {}

# One shared limiter across all provider calls, so a batch of sources can't
# exceed the provider's rate limit (event-loop safe since Python 3.10).
_semaphore: Optional[asyncio.Semaphore] = None


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(AI_MAX_CONCURRENCY)
    return _semaphore


def is_configured() -> bool:
    """True when the active provider has an API key (i.e. live mode is possible)."""
    if AI_PROVIDER == "openai_compat":
        return bool(OPENAI_COMPAT_API_KEY)
    return bool(GEMINI_API_KEY)


def active_model_name() -> str:
    """Model identifier of the active provider, reported to the UI / health check."""
    if AI_PROVIDER == "openai_compat":
        return OPENAI_COMPAT_MODEL
    return GEMINI_MODEL


async def generate_structured(
    system_instruction: Optional[str],
    user_prompt: str,
    schema: Type[T],
    temperature: float,
    max_output_tokens: int,
) -> Optional[T]:
    """
    Ask the active provider for a response matching `schema`.
    Returns the parsed model instance, or None when the model returned
    something unparseable. Retries transient provider errors.
    """
    if not is_configured():
        raise ValueError("No API key configured for the active AI provider.")

    call = _openai_compat_call if AI_PROVIDER == "openai_compat" else _gemini_call
    label = f"{AI_PROVIDER}:{schema.__name__}"

    async def limited_call() -> Optional[T]:
        async with _get_semaphore():
            return await call(system_instruction, user_prompt, schema, temperature, max_output_tokens)

    return await _with_transient_retry(limited_call, label=label)


# ── Gemini backend ───────────────────────────────────────────────────────────

async def _gemini_call(
    system_instruction: Optional[str],
    user_prompt: str,
    schema: Type[T],
    temperature: float,
    max_output_tokens: int,
) -> Optional[T]:
    # pyrefly: ignore[missing-import]
    from google import genai
    # pyrefly: ignore[missing-import]
    from google.genai import types

    # Explicit timeout so a slow/hanging API call can never freeze the server.
    client = genai.Client(api_key=GEMINI_API_KEY, http_options={"timeout": 100_000})

    response = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            thinking_config=types.ThinkingConfig(thinking_level="LOW"),
        ),
    )

    if not response or not response.text:
        return None
    return _loads_schema(response.text, schema)


# ── OpenAI-compatible backend ────────────────────────────────────────────────

async def _openai_compat_call(
    system_instruction: Optional[str],
    user_prompt: str,
    schema: Type[T],
    temperature: float,
    max_output_tokens: int,
) -> Optional[T]:
    """
    Try the primary model, then each configured fallback. A transient error
    (e.g. the model's upstream shared pool is rate-limited) moves on to the
    next model; a non-transient error is raised immediately.
    """
    models = [OPENAI_COMPAT_MODEL, *OPENAI_COMPAT_FALLBACK_MODELS]
    last_exc: Optional[BaseException] = None
    for model in models:
        try:
            return await _openai_compat_model_call(
                model, system_instruction, user_prompt, schema, temperature, max_output_tokens,
            )
        except Exception as exc:
            if not _is_transient_error(exc):
                raise
            last_exc = exc
            logger.warning(
                "Model %s hit transient error (%s); trying next model in fallback chain",
                model, type(exc).__name__,
            )
    assert last_exc is not None
    raise last_exc


async def _openai_compat_model_call(
    model: str,
    system_instruction: Optional[str],
    user_prompt: str,
    schema: Type[T],
    temperature: float,
    max_output_tokens: int,
) -> Optional[T]:
    # Imported lazily so a Gemini-only install never needs the openai package.
    # pyrefly: ignore[missing-import]
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=OPENAI_COMPAT_API_KEY,
        base_url=OPENAI_COMPAT_BASE_URL,
        timeout=100.0,
        max_retries=0,  # our retry layer owns transient-error handling
    )

    messages: list[dict[str, str]] = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": user_prompt})

    async def with_schema() -> Optional[T]:
        completion = await client.beta.chat.completions.parse(
            model=model,
            messages=messages,
            response_format=schema,
            temperature=temperature,
            max_tokens=max_output_tokens,
        )
        return completion.choices[0].message.parsed

    async def json_mode() -> Optional[T]:
        completion = await client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=temperature,
            max_tokens=max_output_tokens,
        )
        raw = completion.choices[0].message.content
        if not raw:
            return None
        return _loads_schema(raw, schema)

    global _schema_supported
    if _schema_supported.get(model) is not False:
        try:
            parsed = await with_schema()
            _schema_supported[model] = True
            return parsed
        except Exception as exc:
            if _is_transient_error(exc) or not _looks_like_schema_unsupported(exc):
                raise
            logger.warning(
                "Structured output rejected by %s (%s); falling back to JSON mode",
                model, type(exc).__name__,
            )
            _schema_supported[model] = False

    return await json_mode()


def _looks_like_schema_unsupported(exc: BaseException) -> bool:
    """Heuristic: did the endpoint reject the strict JSON-schema response_format?"""
    text = str(exc).lower()
    return any(marker in text for marker in _SCHEMA_UNSUPPORTED_MARKERS)


# ── Shared helpers ───────────────────────────────────────────────────────────

def _loads_schema(raw: str, schema: Type[T]) -> Optional[T]:
    """Parse model JSON output into a Pydantic schema. None if unparseable."""
    try:
        data = json.loads(raw.strip())
        return schema(**data)
    except (json.JSONDecodeError, TypeError, ValidationError) as exc:
        logger.warning("Failed to parse model response: %s", exc)
        return None
    except Exception as exc:
        logger.warning("Unexpected error parsing model response: %s", exc)
        return None


def _is_transient_error(exc: BaseException) -> bool:
    """True for errors worth retrying: rate limits, server overload, timeouts."""
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if isinstance(status, int) and not isinstance(status, bool):
        return status in _TRANSIENT_STATUS_CODES

    name = getattr(exc, "status", None)
    if isinstance(name, str) and name.upper() in _TRANSIENT_STATUS_NAMES:
        return True

    text = f"{type(exc).__name__}: {exc}".lower()
    if "timed out" in text or "timeout" in text or "connection error" in text:
        return True

    return bool(_TRANSIENT_TEXT_RE.search(str(exc)))


def _retry_delay(exc: BaseException, attempt: int) -> float:
    """
    Backoff before this retry: exponential with jitter, honoring the
    provider's rate-limit hints (retry-after / x-ratelimit-reset) when
    present, capped by AI_RETRY_MAX_WAIT.
    """
    delay = AI_RETRY_BASE_DELAY * (2 ** (attempt - 1)) * (1.0 + random.random() * 0.25)

    headers = getattr(getattr(exc, "response", None), "headers", None)
    if headers is not None:
        try:
            reset = headers.get("x-ratelimit-reset")
            if reset is not None:
                # Epoch milliseconds — wait for the per-minute window to reset.
                wait = float(reset) / 1000.0 - time.time()
                if 0 < wait < 3600:
                    delay = max(delay, wait + 0.5)
        except (TypeError, ValueError):
            pass
        try:
            after = headers.get("retry-after")
            if after is not None:
                delay = max(delay, float(after) + 0.5)
        except (TypeError, ValueError):
            pass

    return min(delay, AI_RETRY_MAX_WAIT)


async def _with_transient_retry(
    fn: Callable[[], Awaitable[Optional[T]]],
    *,
    label: str,
) -> Optional[T]:
    """Run `fn`, retrying transient provider errors with exponential backoff."""
    last_exc: Optional[BaseException] = None
    for attempt in range(AI_MAX_RETRIES + 1):
        if last_exc is not None:
            delay = _retry_delay(last_exc, attempt)
            logger.warning(
                "%s hit transient error (%s: %s); retrying in %.1fs (attempt %d/%d)",
                label,
                type(last_exc).__name__,
                str(last_exc)[:120],
                delay,
                attempt + 1,
                AI_MAX_RETRIES + 1,
            )
            await asyncio.sleep(delay)
        try:
            return await fn()
        except Exception as exc:
            if not _is_transient_error(exc):
                raise
            last_exc = exc
    assert last_exc is not None  # only reachable after a transient failure
    raise last_exc
