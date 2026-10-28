"""Comprehensive tests for the word-count utility."""

import pytest
from app.utils.word_count import count_words


class TestCountWords:
    """Tests for the NEWSWIRE word-count rule."""

    # ── Basic cases ──────────────────────────────────────────────────────

    def test_empty_string(self):
        assert count_words("") == 0

    def test_whitespace_only(self):
        assert count_words("   \n\t  ") == 0

    def test_none_like_empty(self):
        """None would fail at the type level, but empty should work."""
        assert count_words("") == 0

    def test_single_word(self):
        assert count_words("hello") == 1

    def test_two_words(self):
        assert count_words("hello world") == 2

    # ── Spacing variations ───────────────────────────────────────────────

    def test_repeated_spaces(self):
        assert count_words("hello    world") == 2

    def test_leading_trailing_spaces(self):
        assert count_words("  hello world  ") == 2

    def test_newlines(self):
        assert count_words("hello\nworld") == 2

    def test_tabs(self):
        assert count_words("hello\tworld") == 2

    def test_mixed_whitespace(self):
        assert count_words("  hello \n world \t foo  ") == 3

    # ── Punctuation ──────────────────────────────────────────────────────

    def test_trailing_period(self):
        assert count_words("hello world.") == 2

    def test_comma_separated(self):
        assert count_words("hello, world") == 2

    def test_semicolon(self):
        assert count_words("fact one; fact two") == 4

    def test_colon(self):
        assert count_words("Breaking: news arrives") == 3

    def test_exclamation(self):
        assert count_words("Breaking news!") == 2

    def test_quotes(self):
        assert count_words('"hello world"') == 2

    # ── Numbers ──────────────────────────────────────────────────────────

    def test_pure_number(self):
        assert count_words("100") == 1

    def test_number_in_sentence(self):
        assert count_words("about 100 people") == 3

    def test_decimal_number(self):
        """3.14 is a single whitespace-delimited token, counts as 1 word."""
        assert count_words("3.14") == 1

    def test_year(self):
        assert count_words("in 2024") == 2

    # ── Hyphenated words ─────────────────────────────────────────────────

    def test_hyphenated_word(self):
        """A hyphenated compound counts as ONE word."""
        assert count_words("well-known") == 1

    def test_double_hyphen(self):
        assert count_words("state-of-the-art") == 1

    def test_hyphen_standalone(self):
        """A standalone hyphen is not a word."""
        assert count_words("hello - world") == 2

    # ── Apostrophes / contractions ───────────────────────────────────────

    def test_contraction(self):
        assert count_words("don't") == 1

    def test_possessive(self):
        assert count_words("editor's") == 1

    def test_smart_apostrophe(self):
        """Unicode right single quotation mark (U+2019) used as apostrophe."""
        assert count_words("don\u2019t") == 1

    # ── Exactly ten words ────────────────────────────────────────────────

    def test_exactly_ten_words(self):
        text = "one two three four five six seven eight nine ten"
        assert count_words(text) == 10

    def test_eleven_words(self):
        text = "one two three four five six seven eight nine ten eleven"
        assert count_words(text) == 11

    # ── Malayalam text ───────────────────────────────────────────────────

    def test_malayalam_single_word(self):
        assert count_words("മഴ") == 1

    def test_malayalam_two_words(self):
        assert count_words("കനത്ത മഴ") == 2

    def test_malayalam_sentence(self):
        text = "ആന്ധ്ര ഒഡീഷ തീരങ്ങളിൽ കനത്ത മഴ സാധ്യത"
        assert count_words(text) == 6

    def test_malayalam_with_comma(self):
        text = "ആന്ധ്ര, ഒഡീഷ തീരങ്ങളിൽ"
        assert count_words(text) == 3

    def test_malayalam_with_semicolon(self):
        text = "ജഡ്ജിക്കെതിരെ ശുപാർശ; ഹൈക്കോടതി റിപ്പോർട്ട്"
        assert count_words(text) == 4

    def test_malayalam_sample_ticker_1(self):
        """The first demo ticker candidate."""
        text = "ചേരാനല്ലൂർ അപകടം: ജഡ്ജിക്കെതിരെ സസ്പെൻഷൻ ശുപാർശ"
        wc = count_words(text)
        assert wc <= 10, f"Demo ticker 1 has {wc} words, expected ≤10"

    def test_malayalam_sample_ticker_2(self):
        """The second demo ticker candidate."""
        text = "ആന്ധ്ര, ഒഡീഷ തീരങ്ങളിൽ കനത്ത മഴ സാധ്യത"
        wc = count_words(text)
        assert wc <= 10, f"Demo ticker 2 has {wc} words, expected ≤10"

    def test_mixed_english_malayalam(self):
        text = "Kerala weather alert issued"
        assert count_words(text) == 4

    # ── Edge cases ───────────────────────────────────────────────────────

    def test_only_punctuation(self):
        assert count_words("... --- !!!") == 0

    def test_unicode_em_dash(self):
        """Em dash should separate words."""
        assert count_words("hello—world") == 2

    def test_slash_separated(self):
        assert count_words("and/or") == 2
