"""NEWSWIRE backend configuration — single source of truth for all settings."""

import os
from dotenv import load_dotenv

load_dotenv()

# ── AI provider selection ────────────────────────────────────────────────────
# Which backend generates tickers:
#   gemini        — Google Gemini API
#   openai_compat — any OpenAI-compatible endpoint (OpenRouter, Groq, Mistral, ...)
AI_PROVIDER: str = os.getenv("AI_PROVIDER", "gemini").lower()

# Gemini (active when AI_PROVIDER == "gemini")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
# Note: gemini-2.5-flash is retired for new API keys.
# Verified working models as of Oct 2026: gemini-3.5-flash (fast), gemini-3.8-flash (often overloaded)
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

# OpenAI-compatible endpoint (active when AI_PROVIDER == "openai_compat")
OPENAI_COMPAT_BASE_URL: str = os.getenv("OPENAI_COMPAT_BASE_URL", "https://openrouter.ai/api/v1")
OPENAI_COMPAT_API_KEY: str = os.getenv("OPENAI_COMPAT_API_KEY", "")
# Primary free model, tried first.
OPENAI_COMPAT_MODEL: str = os.getenv("OPENAI_COMPAT_MODEL", "google/gemma-4-31b-it:free")
# Comma-separated fallback models: if the primary (or its upstream shared
# pool) is rate-limited, the chain tries these in order. Free models on
# OpenRouter share contended upstream pools, so the chain matters.
OPENAI_COMPAT_FALLBACK_MODELS: list[str] = [
    m.strip() for m in os.getenv(
        "OPENAI_COMPAT_FALLBACK_MODELS",
        "google/gemma-4-26b-a4b-it:free",
    ).split(",") if m.strip()
]

# Transient error retry (429 rate limits, 5xx overload, timeouts).
# Backoff is exponential with jitter: base * 2^(attempt-1) + jitter. When the
# provider sends a rate-limit reset hint (retry-after / x-ratelimit-reset),
# the retry waits for that window instead, capped by AI_RETRY_MAX_WAIT.
AI_MAX_RETRIES: int = int(os.getenv("AI_MAX_RETRIES", "3"))
AI_RETRY_BASE_DELAY: float = float(os.getenv("AI_RETRY_BASE_DELAY", "1.0"))
AI_RETRY_MAX_WAIT: float = float(os.getenv("AI_RETRY_MAX_WAIT", "70.0"))

# Cap on simultaneous provider calls. OpenRouter's free tier allows
# 20 free-model requests per minute, so keep this well below it.
AI_MAX_CONCURRENCY: int = int(os.getenv("AI_MAX_CONCURRENCY", "4"))

# Ticker constraints
MAX_WORDS: int = 10
MAX_SOURCE_LENGTH: int = 10_000  # characters
MAX_BATCH_SIZE: int = 20

# Server
CORS_ORIGINS: list[str] = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]
