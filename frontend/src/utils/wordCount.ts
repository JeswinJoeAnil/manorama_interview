/**
 * Word-count utility — frontend port of the backend's authoritative implementation.
 * 
 * Rule: A word is a contiguous whitespace-delimited token that contains at
 * least one Unicode letter or digit. Punctuation-only tokens are not counted.
 * 
 * Must produce identical results to backend/app/utils/word_count.py
 */

// Split on whitespace, em-dash, en-dash, forward slash, pipe
const SPLIT_RE = /[\s\u2014\u2013/|]+/;

// Strip leading/trailing non-word chars (preserving internal ones)
const PUNCT_STRIP_RE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

// Check if a token has at least one letter or digit
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  
  const tokens = text.trim().split(SPLIT_RE);
  let count = 0;
  
  for (const token of tokens) {
    if (!token) continue;
    const cleaned = token.replace(PUNCT_STRIP_RE, '');
    if (cleaned && HAS_LETTER_OR_DIGIT.test(cleaned)) {
      count++;
    }
  }
  
  return count;
}

export const MAX_WORDS = 10;

export function isWordCountValid(text: string): boolean {
  const wc = countWords(text);
  return wc > 0 && wc <= MAX_WORDS;
}
