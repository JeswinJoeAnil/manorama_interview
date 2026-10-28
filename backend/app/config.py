"""NEWSWIRE backend configuration — single source of truth for all settings."""

import os
from dotenv import load_dotenv

load_dotenv()

# Gemini AI
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
# Note: gemini-2.5-flash is retired for new API keys.
# Verified working models as of Oct 2026: gemini-3.5-flash (fast), gemini-3.8-flash (often overloaded)
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

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
