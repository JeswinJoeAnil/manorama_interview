"""NEWSWIRE API routes."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException

from app.config import AI_PROVIDER
from app.schemas import (
    BatchValidateRequest,
    BatchValidateResponse,
    GenerateRequest,
    GenerateResponse,
    HealthResponse,
    TickerResult,
    ValidationResult,
    VerifyTickerRequest,
    VerificationResult,
)
from app.services import ai_providers
from app.services.generation_service import generate_ticker, get_demo_ticker, verify_ticker
from app.services.validation_service import validate_ticker
from app.utils.word_count import count_words

logger = logging.getLogger("newswire.api")

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check — reports the active AI provider and whether it is configured."""
    return HealthResponse(
        status="ok",
        gemini_configured=ai_providers.is_configured(),
        provider=AI_PROVIDER,
        model=ai_providers.active_model_name() if ai_providers.is_configured() else "",
    )


@router.post("/tickers/generate", response_model=GenerateResponse)
async def generate_tickers(request: GenerateRequest):
    """Generate ticker candidates for one or more source announcements."""
    is_demo = not ai_providers.is_configured()

    if is_demo:
        # Demo mode — return prewritten tickers
        results = [
            get_demo_ticker(src.source_id, src.content, src.title)
            for src in request.sources
        ]
        return GenerateResponse(
            results=results,
            model_used="demo",
            is_demo=True,
        )

    # Live mode — generate concurrently for each source
    tasks = [
        generate_ticker(
            source_id=src.source_id,
            source_content=src.content,
            source_title=src.title,
            source_category=src.category,
        )
        for src in request.sources
    ]

    results: list[TickerResult] = await asyncio.gather(*tasks)

    return GenerateResponse(
        results=results,
        model_used=ai_providers.active_model_name(),
        is_demo=False,
    )


@router.post("/tickers/validate", response_model=BatchValidateResponse)
async def validate_tickers(request: BatchValidateRequest):
    """Validate one or more tickers against their sources."""
    results: list[ValidationResult] = []
    for item in request.items:
        is_valid, issues = validate_ticker(item.ticker_text, item.source_content, item.source_title)
        results.append(ValidationResult(
            source_id=item.source_id,
            word_count=count_words(item.ticker_text),
            is_valid=is_valid,
            issues=issues,
        ))
    return BatchValidateResponse(results=results)


@router.post("/tickers/verify", response_model=VerificationResult)
async def verify_ticker_endpoint(request: VerifyTickerRequest):
    """Optional semantic drift verification (advisory only)."""
    result = await verify_ticker(
        source_id=request.source_id,
        source_content=request.source_content,
        ticker_text=request.ticker_text,
        key_fact=request.key_fact,
    )
    return result
