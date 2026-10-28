/**
 * NEWSWIRE — Core TypeScript type definitions.
 * 
 * These types mirror the backend Pydantic schemas and define
 * the frontend application state.
 */

// ── Validation ──────────────────────────────────────────────────────────────

export interface ValidationIssue {
  type: 'error' | 'warning';
  code: string;
  message: string;
}

// ── Story (the core domain object) ──────────────────────────────────────────

/**
 * A previously generated ticker kept so the editor can compare
 * and switch between options instead of losing them on regenerate.
 */
export interface TickerOption {
  /** Unique ID within the story's option list */
  id: string;
  /** Version number, unique within the story (1 = first generation) */
  version: number;
  /** Archived ticker text */
  text: string;
  /** Word count of the archived text */
  wordCount: number;
  /** Validation issues captured at generation time */
  validationIssues: ValidationIssue[];
  /** Whether the archived ticker passed all hard validation */
  isValid: boolean;
  /** Key fact the AI extracted for this generation */
  keyFact: string;
  /** Review note attached to this generation */
  reviewNote?: string;
  /** Whether this generation needed human review */
  needsReview: boolean;
  /** Whether this generation ran in demo mode */
  isDemo: boolean;
  /** When this option was archived (ms epoch) */
  generatedAt: number;
}

/**
 * A snapshot of a previous ticker text, taken before an edit overwrote it.
 * Powers the per-story undo / revert controls.
 */
export interface EditSnapshot {
  text: string;
  savedAt: number;
}

export interface Story {
  /** Stable unique ID — never changes after creation */
  sourceId: string;
  /** Optional headline / title */
  sourceTitle?: string;
  /** Original announcement text — never modified */
  sourceContent: string;
  /** Optional category label */
  category?: string;
  
  /** Current ticker text (editable by the editor) */
  tickerText: string;
  /** Key fact extracted from source */
  keyFact: string;
  /** Review note from AI or editor */
  reviewNote?: string;
  
  /** Word count of current ticker text */
  wordCount: number;
  /** Validation issues from the last check */
  validationIssues: ValidationIssue[];
  /** Whether the ticker passes all hard validation */
  isValid: boolean;
  
  /** Whether the editor has approved this ticker */
  isApproved: boolean;
  /** Whether the ticker needs human review */
  needsReview: boolean;
  /** Whether this was generated in demo mode */
  isDemo: boolean;
  
  /** Current generation/processing status */
  status: StoryStatus;
  /** Error message if generation/validation failed */
  error?: string;
  
  /** Version counter — incremented on each edit to prevent stale overwrites */
  editVersion: number;
  /** Version number of the current ticker (0 = none yet, increments per generation) */
  tickerVersion: number;
  /** Previously generated tickers kept as selectable options */
  tickerOptions: TickerOption[];
  /** Ticker text as last generated — the revert target */
  originalTickerText?: string;
  /** Previous ticker texts so the editor can undo an edit */
  editHistory: EditSnapshot[];
  /** Editor-set tags for grouping / filtering (e.g. priority or topic) */
  tags: string[];
}

export type StoryStatus = 
  | 'pending'      // Source added, no ticker yet
  | 'generating'   // AI generation in progress
  | 'generated'    // Ticker generated, awaiting review
  | 'editing'      // Editor is modifying the ticker
  | 'error'        // Generation or validation failed
  | 'approved';    // Editor approved the ticker

// ── API Types ───────────────────────────────────────────────────────────────

export interface SourceAnnouncement {
  source_id: string;
  title?: string;
  content: string;
  category?: string;
}

export interface GenerateRequest {
  sources: SourceAnnouncement[];
}

export interface TickerResult {
  source_id: string;
  ticker: string;
  key_fact: string;
  review_note?: string | null;
  needs_review: boolean;
  word_count: number;
  validation_issues: ValidationIssue[];
  is_valid: boolean;
  is_demo: boolean;
  error?: string | null;
}

export interface GenerateResponse {
  results: TickerResult[];
  model_used: string;
  is_demo: boolean;
}

export interface ValidateItem {
  source_id: string;
  source_content: string;
  ticker_text: string;
  source_title?: string;
}

export interface ValidationResult {
  source_id: string;
  word_count: number;
  is_valid: boolean;
  issues: ValidationIssue[];
}

export interface BatchValidateResponse {
  results: ValidationResult[];
}

export interface HealthResponse {
  status: string;
  /** Kept for compatibility: true when the active AI provider is live. */
  gemini_configured: boolean;
  /** Active provider id: 'gemini' or 'openai_compat'. */
  provider: string;
  model: string;
}

// ── Export Types ─────────────────────────────────────────────────────────────

export interface ExportTicker {
  ticker_id: string;
  source_id: string;
  text: string;
  word_count: number;
  position: number;
  category?: string;
  /** Editor-set tags, if any */
  tags?: string[];
  approved: true;
}

export interface ExportPayload {
  schema_version: '1.0';
  batch_id: string;
  exported_at: string;
  tickers: ExportTicker[];
}

// ── App State ───────────────────────────────────────────────────────────────

/** A source announcement as passed into story creation (ID + text only). */
export type StorySource = Omit<
  Story,
  | 'tickerText' | 'keyFact' | 'wordCount' | 'validationIssues' | 'isValid'
  | 'isApproved' | 'needsReview' | 'isDemo' | 'status' | 'error' | 'editVersion'
  | 'tickerVersion' | 'tickerOptions' | 'originalTickerText' | 'editHistory' | 'tags'
>;

export interface AppState {
  batchId: string;
  batchTitle: string;
  stories: Story[];
  isGenerating: boolean;
  isConnected: boolean;
  geminiConfigured: boolean;
  modelName: string;
}
