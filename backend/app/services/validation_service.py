"""
Deterministic validation service for NEWSWIRE tickers.

All checks here are mechanical / rule-based — no AI involved.
Hard errors block approval; warnings require human review.
"""

from __future__ import annotations
import re
from app.utils.word_count import count_words
from app.schemas import ValidationIssue
from app.config import MAX_WORDS


def validate_ticker(ticker_text: str, source_content: str, source_title: str | None = None) -> tuple[bool, list[ValidationIssue]]:
    """
    Validate a ticker against its source.
    Returns (is_valid, issues). is_valid is False if any hard error exists.
    """
    issues: list[ValidationIssue] = []

    # ── Hard checks (block approval) ────────────────────────────────────────

    # 1. Empty ticker
    stripped = ticker_text.strip()
    if not stripped:
        issues.append(ValidationIssue(
            type="error", code="EMPTY_TICKER",
            message="Ticker text is empty."
        ))
        return False, issues

    # 2. Word count
    wc = count_words(stripped)
    if wc > MAX_WORDS:
        issues.append(ValidationIssue(
            type="error", code="WORD_COUNT_EXCEEDED",
            message=f"Ticker has {wc} words (maximum is {MAX_WORDS})."
        ))

    # 3. Excessive length (even if word count is ok, prevent absurd content)
    if len(stripped) > 500:
        issues.append(ValidationIssue(
            type="error", code="TEXT_TOO_LONG",
            message="Ticker text exceeds 500 characters."
        ))

    # ── Soft checks (warnings — require human review) ───────────────────────

    # 4. Number fidelity — numbers in ticker should appear in source
    _check_number_fidelity(stripped, source_content, issues)

    # 5. Hedging language changes
    _check_hedging_language(stripped, source_content, issues)

    # 6. Check for potential prompt injection markers
    _check_prompt_injection_markers(stripped, issues)

    has_errors = any(i.type == "error" for i in issues)
    return not has_errors, issues


def _extract_numbers(text: str) -> set[str]:
    """Extract numeric strings from text, normalising Malayalam digits."""
    # Map Malayalam digits ൦-൯ to 0-9
    ml_digit_map = str.maketrans("൦൧൨൩൪൫൬൭൮൯", "0123456789")
    normalised = text.translate(ml_digit_map)
    # Find all digit sequences
    return set(re.findall(r'\d+', normalised))


def _check_number_fidelity(ticker: str, source: str, issues: list[ValidationIssue]) -> None:
    """Flag numbers in the ticker that don't appear in the source."""
    ticker_numbers = _extract_numbers(ticker)
    source_numbers = _extract_numbers(source)

    unsupported = ticker_numbers - source_numbers
    # Filter out very common small numbers (1, 2, etc.) that could be stylistic
    significant_unsupported = {n for n in unsupported if len(n) >= 2 or int(n) > 9}

    if significant_unsupported:
        nums_str = ", ".join(sorted(significant_unsupported))
        issues.append(ValidationIssue(
            type="warning", code="UNSUPPORTED_NUMBER",
            message=f"Number(s) {nums_str} in ticker not found in source. Verify accuracy."
        ))


# Hedging / attribution words that indicate uncertainty
_HEDGING_WORDS_EN = {"alleged", "reportedly", "may", "might", "could", "expected",
                     "proposed", "planned", "suspected", "claimed", "accused"}
_CERTAINTY_WORDS_EN = {"confirmed", "guilty", "convicted", "approved", "completed",
                       "achieved", "successful", "verified", "proven"}

# Malayalam equivalents
_HEDGING_WORDS_ML = {"ആരോപണം", "സാധ്യത", "ശുപാർശ", "നിർദേശം", "റിപ്പോർട്ട്",
                     "സൂചന", "ആവശ്യം", "ആരോപിക്കുന്നു", "ആരോപിച്ച", "കണക്കാക്കുന്ന"}
_CERTAINTY_WORDS_ML = {"ഉറപ്പാക്കി", "സ്ഥിരീകരിച്ചു", "തെളിയിച്ചു", "അംഗീകരിച്ചു",
                       "കുറ്റക്കാരൻ", "വിധിച്ചു"}


def _check_hedging_language(ticker: str, source: str, issues: list[ValidationIssue]) -> None:
    """Warn if source uses hedging but ticker uses certainty language."""
    ticker_lower = ticker.lower()
    source_lower = source.lower()

    # Check English
    source_hedges = any(w in source_lower for w in _HEDGING_WORDS_EN)
    ticker_certainty = [w for w in _CERTAINTY_WORDS_EN if w in ticker_lower]

    if source_hedges and ticker_certainty:
        issues.append(ValidationIssue(
            type="warning", code="HEDGING_REMOVED",
            message=f"Source uses uncertain language but ticker uses '{', '.join(ticker_certainty)}'. "
                    f"Verify the claim is established fact, not allegation/proposal."
        ))

    # Check Malayalam
    source_hedges_ml = any(w in source for w in _HEDGING_WORDS_ML)
    ticker_certainty_ml = [w for w in _CERTAINTY_WORDS_ML if w in ticker]

    if source_hedges_ml and ticker_certainty_ml:
        issues.append(ValidationIssue(
            type="warning", code="HEDGING_REMOVED_ML",
            message=f"Source uses uncertain language but ticker uses definitive terms. "
                    f"Verify the claim is established fact."
        ))


def _check_prompt_injection_markers(ticker: str, issues: list[ValidationIssue]) -> None:
    """Flag suspicious content that may indicate prompt injection in output."""
    suspicious_patterns = [
        r'ignore\s+(previous|above|all)\s+instructions',
        r'system\s*:',
        r'you\s+are\s+now',
        r'disregard\s+',
    ]
    ticker_lower = ticker.lower()
    for pattern in suspicious_patterns:
        if re.search(pattern, ticker_lower):
            issues.append(ValidationIssue(
                type="error", code="SUSPICIOUS_CONTENT",
                message="Ticker contains suspicious content that may indicate prompt injection."
            ))
            break
