"""
Word-count utility — the single authoritative implementation.

Rule: A word is a contiguous whitespace-delimited token that contains at
least one Unicode letter or digit. Punctuation-only tokens (like "—" or "...")
are not counted. Internal hyphens, apostrophes, and combining marks (critical
for Malayalam virama ്, vowel signs, etc.) are part of the same word.

This handles English, Malayalam, numbers, hyphenated compounds, and contractions.
The same logic is ported identically to the frontend.
"""

import re
import unicodedata

# Split on whitespace and common punctuation that separates words.
# We split on: whitespace, em-dash (—), en-dash (–), forward slash,
# and vertical pipe — but NOT hyphens (which join compound words)
# and NOT apostrophes (which join contractions).
_SPLIT_RE = re.compile(r'[\s\u2014\u2013/|]+')

# A token is a "word" if it contains at least one letter or digit.
# We strip leading/trailing punctuation from each token first.
_PUNCT_STRIP_RE = re.compile(r'^[\W_]+|[\W_]+$', re.UNICODE)
_HAS_LETTER_OR_DIGIT = re.compile(r'[\w]', re.UNICODE)


def _is_word(token: str) -> bool:
    """Check if a token qualifies as a word (has at least one letter or digit)."""
    # For Malayalam and other scripts with combining marks, we need to check
    # for actual letter/digit characters explicitly since \w doesn't match
    # some combining marks
    for ch in token:
        cat = unicodedata.category(ch)
        if cat.startswith('L') or cat.startswith('N'):
            return True
    return False


def count_words(text: str) -> int:
    """Return the number of words in *text* using the NEWSWIRE word-count rule."""
    if not text or not text.strip():
        return 0

    tokens = _SPLIT_RE.split(text.strip())
    count = 0
    for token in tokens:
        if not token:
            continue
        # Strip leading/trailing punctuation (but keep internal)
        cleaned = _PUNCT_STRIP_RE.sub('', token)
        if cleaned and _is_word(cleaned):
            count += 1
    return count
