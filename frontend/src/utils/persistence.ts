/**
 * Session persistence — keeps stories (and their tags, edit history and
 * ticker options) alive across page refreshes via localStorage.
 *
 * Everything is defensive: a corrupt or foreign payload just yields `null`
 * and the app starts a fresh session. localStorage may also be unavailable
 * (private mode / blocked storage) — in that case persistence is silently
 * skipped and the app behaves exactly as before, in-memory only.
 */

import type { Story } from '../types';

const STORAGE_KEY = 'newswire:session:v1';

export interface StoredSession {
  batchId: string;
  stories: Story[];
}

/** Load a previously saved session. Returns null when none exists or invalid. */
export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (typeof data.batchId !== 'string' || !data.batchId) return null;
    if (!Array.isArray(data.stories)) return null;

    const stories = data.stories
      .map(sanitizeStory)
      .filter((s: Story | null): s is Story => s !== null);

    if (stories.length === 0) return null;
    return { batchId: data.batchId, stories };
  } catch {
    return null;
  }
}

/** Save the current session. An empty story list clears the stored session. */
export function saveSession(batchId: string, stories: Story[]): void {
  try {
    if (stories.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ batchId, stories }));
  } catch {
    // Storage full / unavailable — persistence is best-effort, not critical.
  }
}

/** Remove any stored session without saving the current (empty) state. */
export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ── Sanitisation ─────────────────────────────────────────────────────────────

/**
 * Normalise a persisted story. Older / hand-edited data may be missing the
 * newer fields (tags, editHistory, tickerOptions…) — fill in sane defaults
 * so the rest of the app can rely on them being arrays.
 */
function sanitizeStory(raw: unknown): Story | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;

  // A story needs at minimum an ID and its immutable source text.
  if (typeof s.sourceId !== 'string' || !s.sourceId) return null;
  if (typeof s.sourceContent !== 'string' || !s.sourceContent) return null;

  const status = typeof s.status === 'string'
    && ['pending', 'generating', 'generated', 'editing', 'error', 'approved'].includes(s.status)
    ? s.status
    : 'generated';

  return {
    ...s,
    tickerText: typeof s.tickerText === 'string' ? s.tickerText : '',
    keyFact: typeof s.keyFact === 'string' ? s.keyFact : '',
    wordCount: typeof s.wordCount === 'number' ? s.wordCount : 0,
    validationIssues: Array.isArray(s.validationIssues) ? s.validationIssues : [],
    isValid: s.isValid === true,
    isApproved: s.isApproved === true,
    needsReview: s.needsReview === true,
    isDemo: s.isDemo === true,
    status: status as Story['status'],
    editVersion: typeof s.editVersion === 'number' ? s.editVersion : 0,
    tickerVersion: typeof s.tickerVersion === 'number' ? s.tickerVersion : 0,
    tickerOptions: Array.isArray(s.tickerOptions) ? s.tickerOptions : [],
    originalTickerText: typeof s.originalTickerText === 'string' ? s.originalTickerText : undefined,
    editHistory: Array.isArray(s.editHistory) ? s.editHistory : [],
    tags: Array.isArray(s.tags)
      ? s.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : [],
  } as Story;
}
