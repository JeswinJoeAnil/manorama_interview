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
  gemini_configured: boolean;
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
  approved: true;
}

export interface ExportPayload {
  schema_version: '1.0';
  batch_id: string;
  exported_at: string;
  tickers: ExportTicker[];
}

// ── App State ───────────────────────────────────────────────────────────────

export interface AppState {
  batchId: string;
  batchTitle: string;
  stories: Story[];
  isGenerating: boolean;
  isConnected: boolean;
  geminiConfigured: boolean;
  modelName: string;
}
