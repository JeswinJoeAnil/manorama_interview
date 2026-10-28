# NEWSWIRE Backend

FastAPI service that generates broadcast news tickers (English & Malayalam) from
source announcements, with deterministic validation on top of the AI output.

## Setup

```bash
py -m pip install -r requirements.txt
cp .env.example .env   # then fill in your API key
uvicorn app.main:app --reload
```

## AI providers

The AI backend is pluggable — pick one via `AI_PROVIDER` in `.env`:

| `AI_PROVIDER` | Backend | Key settings |
|---|---|---|
| `gemini` (default) | Google Gemini API | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| `openai_compat` | Any OpenAI-compatible endpoint (OpenRouter, Groq, Mistral, ...) | `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_MODEL` |

**OpenRouter example** (free models, no credit card — create a key at
https://openrouter.ai/keys). Free models share contended upstream pools, so a
fallback chain is configured: the primary model is tried first, then the
fallbacks in order when a pool is rate-limited:

```env
AI_PROVIDER=openai_compat
OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPAT_API_KEY=sk-or-v1-...
OPENAI_COMPAT_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
OPENAI_COMPAT_FALLBACK_MODELS=google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free
```

Notes:
- Free-tier Gemini daily quotas reset at midnight Pacific time.
- With **no key configured for the active provider**, the API runs in demo mode
  (prewritten sample tickers, no API calls).
- `/api/health` reports the active `provider` and `model`.

## Transient error retry

All provider calls (generation + verification) retry transient errors —
429 rate limits, 5xx overload ("high demand" 503s), and timeouts — with
exponential backoff and jitter. If the provider sends a rate-limit reset hint
(`retry-after` / `x-ratelimit-reset`), the retry waits for that window instead
of blindly backing off. Tunable via `AI_MAX_RETRIES`, `AI_RETRY_BASE_DELAY`,
`AI_RETRY_MAX_WAIT`. Non-transient errors (bad request, invalid key) fail
immediately.

For the `openai_compat` provider, a transient failure on the primary model
falls through to the next model in `OPENAI_COMPAT_FALLBACK_MODELS` before the
retry loop kicks in — free-model upstream pools on OpenRouter come and go, so
one saturated pool shouldn't fail the request.

Simultaneous provider calls are capped by `AI_MAX_CONCURRENCY` (default 4) so
batches stay under provider rate limits — OpenRouter's free tier allows 20
free-model requests per minute.

## Architecture

- `app/services/generation_service.py` — prompts, orchestration, word-count
  retry, demo mode. Provider-agnostic.
- `app/services/ai_providers.py` — provider dispatch, transient retry, JSON
  parsing. A provider only turns a prompt into a parsed Pydantic model.
- `app/services/validation_service.py` — deterministic safety validation; the
  AI is treated as an untrusted proposer.
- `app/schemas.py` — request/response models and the structured-output schemas
  shared by every provider.

## Tests

```bash
py -m pytest tests -q
```
