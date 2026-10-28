"""Pydantic request / response schemas for NEWSWIRE API."""

from __future__ import annotations
# pyrefly: ignore[missing-import]
from pydantic import BaseModel, Field
from typing import Optional


# ── AI provider structured output schemas ────────────────────────────────────
# These Pydantic schemas are passed to the active AI provider (Gemini's
# response_schema or OpenAI-compatible structured output) and reused to parse
# and validate whatever the model returns. Providers are untrusted proposers.

class TickerGenerationResponse(BaseModel):
    """Schema the AI provider must return for a single ticker generation."""
    ticker: str = Field(default="", description="Generated ticker text (≤10 words)")
    key_fact: str = Field(default="", description="The central source-supported fact")
    review_note: Optional[str] = Field(default=None, description="Note if source is ambiguous")
    needs_review: bool = Field(default=False, description="True if source is ambiguous or sensitive")


class VerificationResponse(BaseModel):
    """Schema the AI provider must return for semantic drift verification."""
    supported: bool = Field(default=False, description="True if the ticker faithfully represents the source")
    issues: list[str] = Field(default=[], description="Specific factual concerns (empty if none)")
    explanation: str = Field(default="", description="Brief explanation of the assessment")


# ── API request schemas ──────────────────────────────────────────────────────

class SourceAnnouncement(BaseModel):
    """A single source announcement submitted for ticker generation."""
    source_id: str = Field(..., description="Stable unique ID assigned by the frontend")
    title: Optional[str] = Field(default=None, description="Optional headline / title")
    content: str = Field(..., min_length=1, max_length=10_000, description="Full announcement text")
    category: Optional[str] = Field(default=None, description="Optional category label")


class GenerateRequest(BaseModel):
    """Request to generate tickers for one or more announcements."""
    sources: list[SourceAnnouncement] = Field(..., min_length=1, max_length=20)


class ValidateTickerRequest(BaseModel):
    """Request to validate a ticker against its source."""
    source_id: str
    source_content: str
    ticker_text: str
    source_title: Optional[str] = None


class BatchValidateRequest(BaseModel):
    """Request to validate multiple tickers."""
    items: list[ValidateTickerRequest] = Field(..., min_length=1, max_length=20)


class VerifyTickerRequest(BaseModel):
    """Request for optional semantic drift verification."""
    source_id: str
    source_content: str
    ticker_text: str
    key_fact: Optional[str] = None


# ── API response schemas ─────────────────────────────────────────────────────

class ValidationIssue(BaseModel):
    """A single validation issue found."""
    type: str = Field(..., description="'error' or 'warning'")
    code: str = Field(..., description="Machine-readable issue code")
    message: str = Field(..., description="Human-readable description")


class TickerResult(BaseModel):
    """Result of generating a ticker for one source."""
    source_id: str
    ticker: str = ""
    key_fact: str = ""
    review_note: Optional[str] = None
    needs_review: bool = False
    word_count: int = 0
    validation_issues: list[ValidationIssue] = []
    is_valid: bool = False
    is_demo: bool = False
    error: Optional[str] = None


class GenerateResponse(BaseModel):
    """Response containing generated tickers."""
    results: list[TickerResult]
    model_used: str = ""
    is_demo: bool = False


class ValidationResult(BaseModel):
    """Result of validating a single ticker."""
    source_id: str
    word_count: int
    is_valid: bool
    issues: list[ValidationIssue] = []


class BatchValidateResponse(BaseModel):
    """Response for batch validation."""
    results: list[ValidationResult]


class VerificationResult(BaseModel):
    """Result of semantic drift verification."""
    source_id: str
    supported: bool
    issues: list[str] = []
    explanation: str = ""
    error: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    # Kept for frontend compatibility: true when the active provider is live.
    gemini_configured: bool = False
    provider: str = ""  # "gemini" or "openai_compat"
    model: str = ""
