import { useState, useCallback, useEffect, useRef } from 'react';
import {
  FileText, Upload, Loader2, Check, X, AlertTriangle,
  ChevronDown, ChevronUp, RotateCcw, Download, Plus,
  Radio, Wifi, WifiOff, Eye, EyeOff, ArrowUp, ArrowDown,
  ClipboardPaste, FileUp, Newspaper, AlertCircle, CheckCircle2,
  Type, History, Trash2, Undo2, Tags
} from 'lucide-react';
import type { Story, StorySource, ValidationIssue, TickerOption, TickerResult } from './types';
import { countWords, MAX_WORDS } from './utils/wordCount';
import { buildExportPayload, downloadJson, getExportableCount } from './utils/exportJson';
import { SAMPLE_ANNOUNCEMENTS, createStoryFromSource, generateId } from './utils/sampleData';
import { checkHealth, generateTickers } from './services/api';
import { loadSession, saveSession, clearSession } from './utils/persistence';

// ── History / options limits ────────────────────────────────────────────────

const MAX_EDIT_HISTORY = 20;
const MAX_OPTIONS = 10;

const QUICK_TAGS = ['High', 'Medium', 'Low', 'Follow-up'];

// ── Shared ticker-text evaluation ───────────────────────────────────────────

function evaluateTickerText(text: string): {
  wordCount: number;
  validationIssues: ValidationIssue[];
  isValid: boolean;
} {
  const wc = countWords(text);
  const isOverLimit = wc > MAX_WORDS;
  const isEmpty = !text.trim();
  const validationIssues: ValidationIssue[] = [];
  if (isEmpty) validationIssues.push({ type: 'error', code: 'EMPTY_TICKER', message: 'Ticker text is empty.' });
  if (isOverLimit) validationIssues.push({ type: 'error', code: 'WORD_COUNT_EXCEEDED', message: `Ticker has ${wc} words (maximum is ${MAX_WORDS}).` });
  return { wordCount: wc, validationIssues, isValid: !isEmpty && !isOverLimit };
}

// ── Toast Component ─────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === 'success' ? 'bg-success' : type === 'error' ? 'bg-error' : 'bg-ink';

  return (
    <div className={`toast-enter fixed bottom-6 right-6 z-50 ${bg} text-white px-5 py-3 rounded shadow-lg flex items-center gap-3 max-w-md`}>
      {type === 'success' && <CheckCircle2 size={18} />}
      {type === 'error' && <AlertCircle size={18} />}
      {type === 'info' && <AlertCircle size={18} />}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

// ── Validation Badge ────────────────────────────────────────────────────────

function ValidationBadge({ issues, isValid, wordCount }: { issues: ValidationIssue[]; isValid: boolean; wordCount: number }) {
  const errors = issues.filter(i => i.type === 'error');
  const warnings = issues.filter(i => i.type === 'warning');
  const overLimit = wordCount > MAX_WORDS;

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {/* Word count badge */}
      <span className={`font-mono text-xs px-2 py-0.5 rounded ${
        wordCount === 0 ? 'bg-muted text-secondary' :
        overLimit ? 'bg-error/10 text-error font-semibold' :
        'bg-success/10 text-success'
      }`}>
        {wordCount}/{MAX_WORDS} words
      </span>

      {errors.length > 0 && (
        <span className="text-xs px-2 py-0.5 rounded bg-error/10 text-error flex items-center gap-1">
          <X size={12} /> {errors.length} error{errors.length > 1 ? 's' : ''}
        </span>
      )}
      {warnings.length > 0 && (
        <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning flex items-center gap-1">
          <AlertTriangle size={12} /> {warnings.length} warning{warnings.length > 1 ? 's' : ''}
        </span>
      )}
      {isValid && errors.length === 0 && wordCount > 0 && (
        <span className="text-xs px-2 py-0.5 rounded bg-success/10 text-success flex items-center gap-1">
          <Check size={12} /> Valid
        </span>
      )}
    </div>
  );
}

// ── Ticker option helpers ────────────────────────────────────────────────────

/** Snapshot a story's current ticker as a selectable option so nothing is lost on regenerate. */
function snapshotOption(sourceId: string, s: Story, version: number): TickerOption {
  return {
    id: `${sourceId}-opt-${version}-${Date.now()}`,
    version,
    text: s.tickerText,
    wordCount: s.wordCount,
    validationIssues: s.validationIssues,
    isValid: s.isValid,
    keyFact: s.keyFact,
    reviewNote: s.reviewNote,
    needsReview: s.needsReview,
    isDemo: s.isDemo,
    generatedAt: Date.now(),
  };
}

/**
 * Apply a successful generation result to a story, archiving the current ticker
 * first so previously generated tickers stay available as selectable options.
 */
function withGeneratedTicker(s: Story, result: TickerResult): Story {
  const currentText = s.tickerText.trim();
  const newText = result.ticker.trim();

  // Archive the current ticker (unless empty, identical to the new one, or already stored)
  let options = s.tickerOptions;
  if (currentText && currentText !== newText && !options.some(o => o.text.trim() === currentText)) {
    options = [...options, snapshotOption(s.sourceId, s, s.tickerVersion)];
  }

  return {
    ...s,
    tickerOptions: options.slice(-MAX_OPTIONS),
    tickerVersion: Math.max(s.tickerVersion, ...options.map(o => o.version)) + 1,
    tickerText: result.ticker,
    keyFact: result.key_fact,
    reviewNote: result.review_note || undefined,
    needsReview: result.needs_review,
    wordCount: result.word_count,
    validationIssues: result.validation_issues,
    isValid: result.is_valid,
    isDemo: result.is_demo,
    status: 'generated' as const,
    isApproved: false, // Never auto-approve
    // New generation becomes the revert target; the undo stack is obsolete
    originalTickerText: result.ticker,
    editHistory: [],
  };
}

// ── Tag Editor ──────────────────────────────────────────────────────────────

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (!tags.includes(t)) onChange([...tags, t]);
    setInput('');
  };

  const removeTag = (t: string) => onChange(tags.filter(x => x !== t));

  const suggestions = QUICK_TAGS.filter(t => !tags.includes(t));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map(t => (
        <span
          key={t}
          className="text-xs font-mono text-accent bg-accent/10 border border-accent/20 rounded px-2 py-0.5 flex items-center gap-1"
        >
          {t}
          <button
            onClick={() => removeTag(t)}
            className="opacity-50 hover:opacity-100"
            title={`Remove tag "${t}"`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      {open ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); addTag(input); }
              if (e.key === 'Escape') { setOpen(false); setInput(''); }
            }}
            placeholder="Tag name…"
            className="text-xs px-1.5 py-0.5 w-24 border border-muted rounded bg-surface focus:border-accent outline-none"
          />
          {suggestions.length > 0 && (
            <span className="flex items-center gap-1">
              {suggestions.map(t => (
                <button
                  key={t}
                  onClick={() => addTag(t)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-muted text-secondary hover:text-ink hover:bg-muted transition-fast"
                >
                  {t}
                </button>
              ))}
            </span>
          )}
          <button
            onClick={() => { setOpen(false); setInput(''); }}
            className="text-secondary hover:text-ink text-xs px-0.5"
            title="Done"
          >
            <X size={12} />
          </button>
        </span>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-secondary hover:text-ink flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-muted hover:border-accent/40 transition-fast"
          title="Add a tag (e.g. priority or topic)"
        >
          <Tags size={11} /> Tag
        </button>
      )}
    </div>
  );
}

// ── Story Card ──────────────────────────────────────────────────────────────

function StoryCard({
  story,
  index,
  totalStories,
  onEdit,
  onApprove,
  onReject,
  onRegenerate,
  onMoveUp,
  onMoveDown,
  onRestoreOption,
  onDeleteOption,
  onUndo,
  onRevert,
  onTagsChange,
}: {
  story: Story;
  index: number;
  totalStories: number;
  onEdit: (id: string, text: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRegenerate: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRestoreOption: (sourceId: string, optionId: string) => void;
  onDeleteOption: (sourceId: string, optionId: string) => void;
  onUndo: (sourceId: string) => void;
  onRevert: (sourceId: string) => void;
  onTagsChange: (sourceId: string, tags: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const isGenerating = story.status === 'generating';
  const hasTicker = story.tickerText.trim().length > 0;
  const canApprove = story.isValid && hasTicker && !isGenerating;
  const canUndo = story.editHistory.length > 0 && !isGenerating;
  const canRevert = !!story.originalTickerText
    && story.tickerText !== story.originalTickerText
    && !isGenerating;

  return (
    <div className={`bg-surface border rounded transition-fast ${
      story.isApproved ? 'border-success/40 shadow-sm' :
      story.status === 'error' ? 'border-error/40' :
      story.needsReview ? 'border-warning/30' :
      'border-muted'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-muted/60">
        {/* Index + status */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs text-secondary bg-muted rounded px-1.5 py-0.5 shrink-0">
            {String(index + 1).padStart(2, '0')}
          </span>
          {story.isApproved && (
            <span className="text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded flex items-center gap-1">
              <Check size={12} /> Approved
            </span>
          )}
          {story.isDemo && (
            <span className="text-xs font-medium text-secondary bg-muted px-2 py-0.5 rounded">
              DEMO
            </span>
          )}
          {story.needsReview && !story.isApproved && (
            <span className="text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded flex items-center gap-1">
              <AlertTriangle size={12} /> Review
            </span>
          )}
          {isGenerating && (
            <span className="text-xs font-medium text-secondary flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Generating…
            </span>
          )}
        </div>

        {/* Title / category / tags */}
        <div className="flex-1 min-w-0">
          {story.sourceTitle && (
            <span className="font-malayalam text-sm font-semibold text-ink truncate block">
              {story.sourceTitle}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {story.category && (
              <span className="font-mono text-xs text-secondary">{story.category}</span>
            )}
            <TagEditor tags={story.tags} onChange={(tags) => onTagsChange(story.sourceId, tags)} />
          </div>
        </div>

        {/* Reorder buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onMoveUp(story.sourceId)}
            disabled={index === 0}
            className="p-1 rounded text-secondary hover:text-ink hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-fast"
            title="Move up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => onMoveDown(story.sourceId)}
            disabled={index === totalStories - 1}
            className="p-1 rounded text-secondary hover:text-ink hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-fast"
            title="Move down"
          >
            <ArrowDown size={14} />
          </button>
        </div>
      </div>

      {/* Ticker editing area */}
      <div className="px-4 py-3">
        {isGenerating ? (
          <div className="flex items-center gap-3 py-4 justify-center text-secondary">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Generating ticker…</span>
          </div>
        ) : story.status === 'error' && !hasTicker ? (
          <div className="py-3">
            <div className="text-sm text-error flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{story.error || 'Generation failed. Click retry to try again.'}</span>
            </div>
          </div>
        ) : (
          <>
            <textarea
              value={story.tickerText}
              onChange={(e) => onEdit(story.sourceId, e.target.value)}
              placeholder="Ticker text will appear here…"
              className="w-full font-malayalam text-base leading-relaxed bg-transparent border-0 border-b-2 border-muted focus:border-accent outline-none resize-none py-1 px-0 transition-fast placeholder:text-secondary/50"
              rows={1}
              disabled={isGenerating}
            />
            <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
              <ValidationBadge
                issues={story.validationIssues}
                isValid={story.isValid}
                wordCount={story.wordCount}
              />
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onUndo(story.sourceId)}
                  disabled={!canUndo}
                  className="p-1.5 rounded text-secondary hover:text-ink hover:bg-muted transition-fast disabled:opacity-30 disabled:cursor-not-allowed"
                  title={canUndo
                    ? `Undo — restore previous text: "${story.editHistory[story.editHistory.length - 1].text.slice(0, 40)}${story.editHistory[story.editHistory.length - 1].text.length > 40 ? '…' : ''}"`
                    : 'Nothing to undo'}
                >
                  <Undo2 size={13} />
                </button>
                <button
                  onClick={() => onRevert(story.sourceId)}
                  disabled={!canRevert}
                  className="text-xs px-2.5 py-1.5 rounded text-secondary hover:text-ink hover:bg-muted transition-fast flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Revert to the last generated text"
                >
                  <RotateCcw size={12} /> Revert
                </button>
                <button
                  onClick={() => onRegenerate(story.sourceId)}
                  disabled={isGenerating}
                  className="text-xs px-2.5 py-1.5 rounded text-secondary hover:text-ink hover:bg-muted transition-fast flex items-center gap-1 disabled:opacity-40"
                  title="Regenerate ticker"
                >
                  <RotateCcw size={12} /> Retry
                </button>
                {story.isApproved ? (
                  <button
                    onClick={() => onReject(story.sourceId)}
                    className="text-xs px-3 py-1.5 rounded bg-error/10 text-error hover:bg-error/20 transition-fast flex items-center gap-1 font-medium"
                  >
                    <X size={12} /> Revoke
                  </button>
                ) : (
                  <button
                    onClick={() => onApprove(story.sourceId)}
                    disabled={!canApprove}
                    className="text-xs px-3 py-1.5 rounded bg-success/10 text-success hover:bg-success/20 transition-fast flex items-center gap-1 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    title={!canApprove ? 'Fix validation errors before approving' : 'Approve this ticker'}
                  >
                    <Check size={12} /> Approve
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Key fact & review note */}
        {story.keyFact && (
          <div className="mt-2 text-xs text-secondary">
            <span className="font-mono font-medium">KEY FACT:</span> <span className="font-malayalam">{story.keyFact}</span>
          </div>
        )}
        {story.reviewNote && (
          <div className="mt-1 text-xs text-warning bg-warning/5 px-2 py-1 rounded">
            <span className="font-mono font-medium">NOTE:</span> {story.reviewNote}
          </div>
        )}

        {/* Validation issues detail */}
        {story.validationIssues.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowIssues(!showIssues)}
              className="text-xs text-secondary hover:text-ink flex items-center gap-1 transition-fast"
            >
              {showIssues ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {story.validationIssues.length} validation issue{story.validationIssues.length > 1 ? 's' : ''}
            </button>
            {showIssues && (
              <div className="mt-1 space-y-1">
                {story.validationIssues.map((issue, i) => (
                  <div key={i} className={`text-xs px-2 py-1 rounded ${
                    issue.type === 'error' ? 'bg-error/5 text-error' : 'bg-warning/5 text-warning'
                  }`}>
                    <span className="font-mono font-medium">{issue.code}:</span> {issue.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Previously generated options */}
        {story.tickerOptions.length > 0 && (
          <div className="mt-3 border-t border-muted/40 pt-2">
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="text-xs text-secondary hover:text-ink flex items-center gap-1.5 transition-fast"
              title="Previously generated tickers stay available so you can compare and switch"
            >
              <History size={12} />
              Previously generated ({story.tickerOptions.length})
              {showOptions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showOptions && (
              <div className="mt-2 space-y-1.5">
                {[...story.tickerOptions].reverse().map(option => (
                  <div
                    key={option.id}
                    className="flex items-start gap-2 rounded border border-muted bg-muted/20 px-2.5 py-2"
                  >
                    <span className="font-mono text-[10px] px-1.5 py-0.5 bg-muted rounded text-secondary shrink-0 mt-0.5">
                      V{option.version}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-malayalam text-xs text-ink/90 leading-snug line-clamp-2">
                        {option.text}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px] text-secondary">
                        <span>{option.wordCount}/{MAX_WORDS}w</span>
                        {option.isValid ? (
                          <span className="text-success flex items-center gap-0.5"><Check size={9} /> valid</span>
                        ) : (
                          <span className="text-warning flex items-center gap-0.5"><AlertTriangle size={9} /> issues</span>
                        )}
                        {option.isDemo && <span>demo</span>}
                        <span>{new Date(option.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => onRestoreOption(story.sourceId, option.id)}
                        disabled={isGenerating}
                        className="text-xs px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-fast flex items-center gap-1 disabled:opacity-40"
                        title="Use this version as the current ticker (current text stays available above)"
                      >
                        <Check size={11} /> Use
                      </button>
                      <button
                        onClick={() => onDeleteOption(story.sourceId, option.id)}
                        disabled={isGenerating}
                        className="p-1 rounded text-secondary hover:text-error transition-fast disabled:opacity-40"
                        title="Discard this option"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Source expand */}
      <div className="border-t border-muted/40">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left px-4 py-2 text-xs text-secondary hover:text-ink hover:bg-muted/30 transition-fast flex items-center gap-2"
        >
          {expanded ? <EyeOff size={12} /> : <Eye size={12} />}
          {expanded ? 'Hide' : 'Show'} original source
          <span className="font-mono">({story.sourceId})</span>
        </button>
        {expanded && (
          <div className="px-4 pb-3">
            <div className="font-malayalam text-sm text-ink/80 leading-relaxed whitespace-pre-wrap bg-muted/30 p-3 rounded border border-muted/50 max-h-64 overflow-y-auto">
              {story.sourceContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Broadcast Preview ───────────────────────────────────────────────────────

function BroadcastPreview({ stories }: { stories: Story[] }) {
  const [visible, setVisible] = useState(true);
  const approvedTickers = stories.filter(s => s.isApproved && s.isValid && s.tickerText.trim());

  if (approvedTickers.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <button
        onClick={() => setVisible(!visible)}
        className="absolute -top-8 right-4 text-xs bg-dark-bg text-dark-text px-3 py-1 rounded-t hover:bg-ink transition-fast flex items-center gap-1.5"
      >
        <Radio size={12} />
        {visible ? 'Hide' : 'Show'} Broadcast Preview
      </button>
      {visible && (
        <div className="bg-dark-bg border-t-2 border-accent py-2.5 overflow-hidden">
          <div className="flex items-center gap-2 px-4">
            <span className="bg-accent text-white text-xs font-bold px-2 py-0.5 rounded shrink-0 uppercase tracking-wider">
              Breaking
            </span>
            <div className="overflow-hidden flex-1">
              <div className="ticker-scroll whitespace-nowrap">
                {approvedTickers.map((s, i) => (
                  <span key={s.sourceId} className="font-malayalam text-dark-text text-sm mx-6 inline-block">
                    {s.tickerText}
                    {i < approvedTickers.length - 1 && (
                      <span className="text-accent mx-4 font-bold">●</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Batch Importer Modal ────────────────────────────────────────────────────

type ImportMode = 'single' | 'batch' | 'file';

function BatchImporter({
  onImport,
  onClose,
}: {
  onImport: (stories: StorySource[]) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ImportMode>('single');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    setError('');

    if (mode === 'single') {
      if (!text.trim()) { setError('Please enter the announcement text.'); return; }
      onImport([{
        sourceId: generateId(),
        sourceTitle: title.trim() || undefined,
        sourceContent: text.trim(),
        category: category.trim() || undefined,
      }]);
    } else if (mode === 'batch') {
      if (!text.trim()) { setError('Please paste the announcements.'); return; }
      const parts = text.split('--- ANNOUNCEMENT ---').map(p => p.trim()).filter(Boolean);
      if (parts.length === 0) { setError('No announcements found. Use "--- ANNOUNCEMENT ---" as delimiter.'); return; }
      onImport(parts.map(content => ({
        sourceId: generateId(),
        sourceContent: content,
        category: category.trim() || undefined,
      })));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (!content?.trim()) { setError('File is empty.'); return; }

      if (file.name.endsWith('.csv')) {
        try {
          const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length < 2) { setError('CSV must have a header row and at least one data row.'); return; }
          const header = lines[0].toLowerCase();
          if (!header.includes('content')) {
            setError('CSV must include a "content" column. Expected header: title,content,category'); return;
          }
          const headerParts = lines[0].split(',').map(h => h.trim().toLowerCase());
          const contentIdx = headerParts.indexOf('content');
          const titleIdx = headerParts.indexOf('title');
          const catIdx = headerParts.indexOf('category');

          const stories = lines.slice(1).map(line => {
            // Simple CSV parsing (handles basic cases)
            const parts = parseCSVLine(line);
            return {
              sourceId: generateId(),
              sourceTitle: titleIdx >= 0 ? parts[titleIdx]?.trim() : undefined,
              sourceContent: parts[contentIdx]?.trim() || '',
              category: catIdx >= 0 ? parts[catIdx]?.trim() : undefined,
            };
          }).filter(s => s.sourceContent);

          if (stories.length === 0) { setError('No valid stories found in CSV.'); return; }
          onImport(stories);
        } catch {
          setError('Failed to parse CSV file. Check format.');
        }
      } else {
        // TXT file — split by delimiter or treat as single
        const parts = content.includes('--- ANNOUNCEMENT ---')
          ? content.split('--- ANNOUNCEMENT ---').map(p => p.trim()).filter(Boolean)
          : [content.trim()];

        onImport(parts.map(c => ({
          sourceId: generateId(),
          sourceContent: c,
        })));
      }
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40" onClick={onClose}>
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-muted">
          <h2 className="text-lg font-semibold text-ink">Add Announcements</h2>
          <button onClick={onClose} className="text-secondary hover:text-ink p-1 rounded hover:bg-muted transition-fast">
            <X size={18} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-muted">
          {[
            { key: 'single' as const, label: 'Single', icon: Type },
            { key: 'batch' as const, label: 'Batch Paste', icon: ClipboardPaste },
            { key: 'file' as const, label: 'File Import', icon: FileUp },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setMode(key); setError(''); }}
              className={`flex-1 px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-fast border-b-2 ${
                mode === key ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-ink'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {mode === 'file' ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center hover:border-accent/40 transition-fast">
                <Upload size={32} className="mx-auto text-secondary mb-3" />
                <p className="text-sm text-secondary mb-3">
                  Upload a <strong>.txt</strong> or <strong>.csv</strong> file
                </p>
                <label className="inline-block px-4 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-accent-hover transition-fast cursor-pointer">
                  Choose File
                  <input ref={fileInputRef} type="file" accept=".txt,.csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
              <div className="text-xs text-secondary space-y-1">
                <p><strong>TXT:</strong> Use <code className="font-mono bg-muted px-1 rounded">--- ANNOUNCEMENT ---</code> between stories, or import as single story.</p>
                <p><strong>CSV:</strong> Header row: <code className="font-mono bg-muted px-1 rounded">title,content,category</code></p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {mode === 'single' && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="col-span-1 text-sm px-3 py-2 border border-muted rounded bg-surface focus:border-accent outline-none transition-fast font-malayalam"
                  />
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="Category (optional)"
                    className="col-span-1 text-sm px-3 py-2 border border-muted rounded bg-surface focus:border-accent outline-none transition-fast font-malayalam"
                  />
                </div>
              )}
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={mode === 'single'
                  ? 'Paste the full announcement text here…'
                  : 'Paste multiple announcements separated by:\n--- ANNOUNCEMENT ---\n\nEach section becomes a separate story.'}
                className="w-full text-sm px-3 py-2.5 border border-muted rounded bg-surface focus:border-accent outline-none transition-fast font-malayalam leading-relaxed"
                rows={8}
              />
              {mode === 'batch' && (
                <input
                  type="text"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="Category for all (optional)"
                  className="w-full text-sm px-3 py-2 border border-muted rounded bg-surface focus:border-accent outline-none transition-fast"
                />
              )}
            </div>
          )}

          {error && (
            <div className="mt-3 text-sm text-error bg-error/5 px-3 py-2 rounded flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {mode !== 'file' && (
          <div className="px-5 py-4 border-t border-muted flex justify-end gap-3">
            <button onClick={onClose} className="text-sm px-4 py-2 text-secondary hover:text-ink transition-fast">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="text-sm px-5 py-2 bg-accent text-white font-medium rounded hover:bg-accent-hover transition-fast"
            >
              Add {mode === 'batch' ? 'Announcements' : 'Announcement'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CSV line parser (handles quoted fields) ─────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Main App ────────────────────────────────────────────────────────────────

function App() {
  const [initialSession] = useState(() => loadSession());
  const [stories, setStories] = useState<Story[]>(() => initialSession?.stories ?? []);
  const [batchId, setBatchId] = useState(() => initialSession?.batchId ?? `batch-${Date.now()}`);
  const [batchTitle] = useState('Editorial Session');
  const [isConnected, setIsConnected] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [modelName, setModelName] = useState('');
  const [providerName, setProviderName] = useState('');
  const [showImporter, setShowImporter] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const generationVersionRef = useRef<Map<string, number>>(new Map());

  // Friendly label for the active AI provider shown in the status bar.
  const providerLabel = providerName === 'gemini' ? 'Gemini' : 'AI';

  // Health check on mount
  useEffect(() => {
    const check = async () => {
      try {
        const health = await checkHealth();
        setIsConnected(true);
        setGeminiConfigured(health.gemini_configured);
        setModelName(health.model);
        setProviderName(health.provider);
      } catch {
        setIsConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Session persistence (best-effort, debounced) ──────────────────────

  useEffect(() => {
    const timer = setTimeout(() => saveSession(batchId, stories), 300);
    return () => clearTimeout(timer);
  }, [batchId, stories]);

  // ── Story management ──────────────────────────────────────────────────

  const addStories = useCallback((sources: StorySource[]) => {
    const newStories = sources.map(src =>
      createStoryFromSource(src.sourceId, src.sourceContent, src.sourceTitle, src.category)
    );
    setStories(prev => [...prev, ...newStories]);
    setShowImporter(false);
    setToast({ message: `Added ${newStories.length} announcement${newStories.length > 1 ? 's' : ''}`, type: 'info' });
  }, []);

  const loadSamples = useCallback(() => {
    const newStories = SAMPLE_ANNOUNCEMENTS.map(src =>
      createStoryFromSource(src.sourceId, src.sourceContent, src.sourceTitle, src.category)
    );
    setStories(prev => [...prev, ...newStories]);
    setToast({ message: 'Loaded 2 sample Malayalam announcements', type: 'info' });
  }, []);

  const editTicker = useCallback((sourceId: string, text: string) => {
    setStories(prev => prev.map(s => {
      if (s.sourceId !== sourceId) return s;
      const { wordCount: wc, validationIssues, isValid } = evaluateTickerText(text);

      // Snapshot the pre-edit text so the editor can undo (skip no-op churn)
      const lastSnapshot = s.editHistory[s.editHistory.length - 1];
      const editHistory = s.tickerText.trim() && lastSnapshot?.text !== s.tickerText
        ? [...s.editHistory, { text: s.tickerText, savedAt: Date.now() }].slice(-MAX_EDIT_HISTORY)
        : s.editHistory;

      return {
        ...s,
        tickerText: text,
        wordCount: wc,
        validationIssues,
        isValid,
        isApproved: isValid ? s.isApproved : false, // Auto-revoke if invalid
        status: 'editing' as const,
        editVersion: s.editVersion + 1,
        editHistory,
      };
    }));
  }, []);

  /** Restore the most recent pre-edit snapshot. */
  const undoTicker = useCallback((sourceId: string) => {
    setStories(prev => prev.map(s => {
      if (s.sourceId !== sourceId || s.editHistory.length === 0) return s;
      const last = s.editHistory[s.editHistory.length - 1];
      const { wordCount: wc, validationIssues, isValid } = evaluateTickerText(last.text);
      return {
        ...s,
        tickerText: last.text,
        wordCount: wc,
        validationIssues,
        isValid,
        isApproved: isValid ? s.isApproved : false,
        status: 'editing' as const,
        editVersion: s.editVersion + 1,
        editHistory: s.editHistory.slice(0, -1),
      };
    }));
  }, []);

  /** Restore the last generated text (the AI output), keeping the current text in the undo stack. */
  const revertTicker = useCallback((sourceId: string) => {
    setStories(prev => prev.map(s => {
      if (s.sourceId !== sourceId || !s.originalTickerText || s.tickerText === s.originalTickerText) return s;
      const { wordCount: wc, validationIssues, isValid } = evaluateTickerText(s.originalTickerText);
      const currentText = s.tickerText;
      const editHistory = s.tickerText.trim() && !s.editHistory.some(h => h.text === currentText)
        ? [...s.editHistory, { text: currentText, savedAt: Date.now() }].slice(-MAX_EDIT_HISTORY)
        : s.editHistory;
      return {
        ...s,
        tickerText: s.originalTickerText,
        wordCount: wc,
        validationIssues,
        isValid,
        isApproved: isValid ? s.isApproved : false,
        status: 'editing' as const,
        editVersion: s.editVersion + 1,
        editHistory,
      };
    }));
  }, []);

  const approveTicker = useCallback((sourceId: string) => {
    setStories(prev => prev.map(s => {
      if (s.sourceId !== sourceId) return s;
      if (!s.isValid || !s.tickerText.trim()) return s;
      return { ...s, isApproved: true, status: 'approved' as const };
    }));
  }, []);

  const rejectTicker = useCallback((sourceId: string) => {
    setStories(prev => prev.map(s => {
      if (s.sourceId !== sourceId) return s;
      return { ...s, isApproved: false, status: 'generated' as const };
    }));
  }, []);

  const moveStory = useCallback((sourceId: string, direction: 'up' | 'down') => {
    setStories(prev => {
      const idx = prev.findIndex(s => s.sourceId === sourceId);
      if (idx === -1) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const newStories = [...prev];
      [newStories[idx], newStories[newIdx]] = [newStories[newIdx], newStories[idx]];
      return newStories;
    });
  }, []);

  // ── Generation ────────────────────────────────────────────────────────

  const generateAll = useCallback(async () => {
    const pending = stories.filter(s => s.status === 'pending' || s.status === 'error');
    if (pending.length === 0) return;

    setIsGenerating(true);

    // Mark pending stories as generating
    const versionMap = new Map<string, number>();
    setStories(prev => prev.map(s => {
      if (s.status === 'pending' || s.status === 'error') {
        const version = s.editVersion;
        versionMap.set(s.sourceId, version);
        generationVersionRef.current.set(s.sourceId, version);
        return { ...s, status: 'generating' as const, error: undefined };
      }
      return s;
    }));

    try {
      const response = await generateTickers({
        sources: pending.map(s => ({
          source_id: s.sourceId,
          title: s.sourceTitle,
          content: s.sourceContent,
          category: s.category,
        })),
      });

      // Apply results, checking edit version to prevent stale overwrites
      setStories(prev => prev.map(s => {
        const result = response.results.find(r => r.source_id === s.sourceId);
        if (!result) return s;

        // Check if the story was edited while we were generating
        const expectedVersion = versionMap.get(s.sourceId);
        if (expectedVersion !== undefined && s.editVersion !== expectedVersion) {
          // Story was edited during generation — don't overwrite
          return s;
        }

        if (result.error) {
          return {
            ...s,
            status: 'error' as const,
            error: result.error,
          };
        }

        // Archives the previous ticker so all generated options stay available
        return withGeneratedTicker(s, result);
      }));

      const successCount = response.results.filter(r => !r.error).length;
      const failCount = response.results.filter(r => r.error).length;
      const mode = response.is_demo ? ' (demo mode)' : '';
      setToast({
        message: `Generated ${successCount} ticker${successCount !== 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}${mode}`,
        type: failCount > 0 ? 'error' : 'success',
      });
    } catch (err: any) {
      setStories(prev => prev.map(s => {
        if (s.status === 'generating') {
          return { ...s, status: 'error' as const, error: err.message || 'Generation failed' };
        }
        return s;
      }));
      setToast({ message: err.message || 'Generation failed', type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  }, [stories]);

  const regenerateOne = useCallback(async (sourceId: string) => {
    const story = stories.find(s => s.sourceId === sourceId);
    if (!story) return;

    const version = story.editVersion;
    generationVersionRef.current.set(sourceId, version);

    setStories(prev => prev.map(s =>
      s.sourceId === sourceId ? { ...s, status: 'generating' as const, error: undefined } : s
    ));

    try {
      const response = await generateTickers({
        sources: [{
          source_id: story.sourceId,
          title: story.sourceTitle,
          content: story.sourceContent,
          category: story.category,
        }],
      });

      const result = response.results[0];
      if (!result) return;

      setStories(prev => prev.map(s => {
        if (s.sourceId !== sourceId) return s;
        if (s.editVersion !== version) return s; // Edited during generation

        if (result.error) {
          return { ...s, status: 'error' as const, error: result.error };
        }

        // Archives the previous ticker so all generated options stay available
        return withGeneratedTicker(s, result);
      }));
    } catch (err: any) {
      setStories(prev => prev.map(s =>
        s.sourceId === sourceId ? { ...s, status: 'error' as const, error: err.message } : s
      ));
    }
  }, [stories]);

  // ── Ticker options (previously generated versions) ────────────────────

  /** Swap a previously generated option back into the editor; the current text moves into the option list. */
  const restoreTickerOption = useCallback((sourceId: string, optionId: string) => {
    setStories(prev => prev.map(s => {
      if (s.sourceId !== sourceId) return s;
      const option = s.tickerOptions.find(o => o.id === optionId);
      if (!option) return s;

      let options = s.tickerOptions.filter(o => o.id !== optionId);
      // Keep the current text available so switching between options is never lossy
      const current = s.tickerText.trim();
      if (current && current !== option.text.trim() && !options.some(o => o.text.trim() === current)) {
        options = [...options, snapshotOption(s.sourceId, s, s.tickerVersion)];
      }

      // Snapshot the pre-switch text so the editor can undo this swap
      const editHistory = current
        ? [...s.editHistory, { text: s.tickerText, savedAt: Date.now() }].slice(-MAX_EDIT_HISTORY)
        : s.editHistory;

      return {
        ...s,
        tickerOptions: options,
        tickerVersion: option.version,
        tickerText: option.text,
        keyFact: option.keyFact,
        reviewNote: option.reviewNote,
        needsReview: option.needsReview,
        wordCount: option.wordCount,
        validationIssues: option.validationIssues,
        isValid: option.isValid,
        isDemo: option.isDemo,
        status: 'generated' as const,
        isApproved: false, // Swapping versions revokes approval
        originalTickerText: option.text,
        editHistory,
        editVersion: s.editVersion + 1,
      };
    }));
  }, []);

  /** Discard one archived option. */
  const deleteTickerOption = useCallback((sourceId: string, optionId: string) => {
    setStories(prev => prev.map(s =>
      s.sourceId !== sourceId
        ? s
        : { ...s, tickerOptions: s.tickerOptions.filter(o => o.id !== optionId) }
    ));
  }, []);

  // ── Tags / grouping ───────────────────────────────────────────────────

  const setTags = useCallback((sourceId: string, tags: string[]) => {
    setStories(prev => prev.map(s =>
      s.sourceId === sourceId ? { ...s, tags } : s
    ));
  }, []);

  // ── New session ───────────────────────────────────────────────────────

  const newSession = useCallback(() => {
    if (stories.length > 0 && !window.confirm('Start a new session? All current stories will be discarded (export first if you need them).')) return;
    setStories([]);
    setBatchId(`batch-${Date.now()}`);
    setTagFilter(null);
    clearSession();
    setToast({ message: 'New session started', type: 'info' });
  }, [stories.length]);

  // ── Tag / category filter ─────────────────────────────────────────────

  const allFilterLabels = Array.from(new Set([
    ...stories.flatMap(s => s.tags),
    ...stories.map(s => s.category).filter((c): c is string => !!c),
  ]));

  // ── Export ─────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    const exportable = getExportableCount(stories);
    if (exportable === 0) return;

    const payload = buildExportPayload(stories, batchId);
    downloadJson(payload);
    setToast({ message: `Exported ${exportable} approved ticker${exportable > 1 ? 's' : ''}`, type: 'success' });
  }, [stories, batchId]);

  // ── Stats ─────────────────────────────────────────────────────────────

  const totalStories = stories.length;
  const approvedCount = stories.filter(s => s.isApproved).length;
  const needsReviewCount = stories.filter(s => s.needsReview && !s.isApproved).length;
  const errorCount = stories.filter(s => s.status === 'error' || s.validationIssues.some(i => i.type === 'error')).length;
  const exportableCount = getExportableCount(stories);
  const pendingCount = stories.filter(s => s.status === 'pending').length;

  // Filtered view — reorder still operates on the full ordered list
  const visibleStories = tagFilter
    ? stories.filter(s => s.tags.includes(tagFilter) || s.category === tagFilter)
    : stories;

  return (
    <div className="min-h-screen bg-bg pb-16">
      {/* ── Top Navigation ───────────────────────────────────────────── */}
      <header className="bg-surface border-b border-muted sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left: Brand */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Newspaper size={20} className="text-accent" />
                <h1 className="text-lg font-bold tracking-tight text-ink">NEWSWIRE</h1>
              </div>
              <span className="hidden sm:inline text-xs font-mono text-secondary bg-muted px-2 py-0.5 rounded uppercase tracking-widest">
                Editorial Desk
              </span>
              {batchTitle && (
                <span className="hidden md:inline text-xs text-secondary border-l border-muted pl-3 ml-1">{batchTitle}</span>
              )}
            </div>

            {/* Right: Status + Actions */}
            <div className="flex items-center gap-3">
              {/* Connection status */}
              <div className="flex items-center gap-1.5 text-xs">
                {isConnected ? (
                  <span className="text-success flex items-center gap-1">
                    <Wifi size={13} />
                    <span className="hidden sm:inline">
                      {geminiConfigured ? `${providerLabel} (${modelName || 'live'})` : 'Demo Mode'}
                    </span>
                  </span>
                ) : (
                  <span className="text-error flex items-center gap-1">
                    <WifiOff size={13} />
                    <span className="hidden sm:inline">Disconnected</span>
                  </span>
                )}
              </div>

              <div className="h-5 w-px bg-muted hidden sm:block" />

              {/* New batch */}
              <button
                onClick={() => setShowImporter(true)}
                className="text-sm px-3 py-1.5 text-ink hover:bg-muted rounded transition-fast flex items-center gap-1.5 font-medium"
              >
                <Plus size={14} /> Add
              </button>

              {/* Export */}
              <button
                onClick={handleExport}
                disabled={exportableCount === 0}
                className="text-sm px-3 py-1.5 bg-ink text-white rounded hover:bg-ink/80 transition-fast flex items-center gap-1.5 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                title={exportableCount === 0 ? 'No approved tickers to export' : `Export ${exportableCount} ticker${exportableCount > 1 ? 's' : ''}`}
              >
                <Download size={14} />
                <span className="hidden sm:inline">Export</span>
                {exportableCount > 0 && (
                  <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded">{exportableCount}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Summary Strip ────────────────────────────────────────────── */}
      {totalStories > 0 && (
        <div className="bg-surface border-b border-muted">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-center gap-4 sm:gap-6 py-2 overflow-x-auto">
              <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                <FileText size={13} className="text-secondary" />
                <span className="font-mono font-medium">{totalStories}</span>
                <span className="text-secondary">Stories</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                <Check size={13} className="text-success" />
                <span className="font-mono font-medium text-success">{approvedCount}</span>
                <span className="text-secondary">Approved</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                <AlertTriangle size={13} className="text-warning" />
                <span className="font-mono font-medium text-warning">{needsReviewCount}</span>
                <span className="text-secondary">Review</span>
              </div>
              {errorCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                  <AlertCircle size={13} className="text-error" />
                  <span className="font-mono font-medium text-error">{errorCount}</span>
                  <span className="text-secondary">Issues</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {totalStories === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
              <Newspaper size={28} className="text-secondary" />
            </div>
            <h2 className="text-xl font-semibold text-ink mb-2">Welcome to NEWSWIRE</h2>
            <p className="text-sm text-secondary max-w-md mb-1">
              From source to broadcast. Every word accountable.
            </p>
            <p className="text-xs text-secondary max-w-md mb-8">
              Transform announcements into concise broadcast tickers with AI-assisted generation and editorial review.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowImporter(true)}
                className="px-5 py-2.5 bg-accent text-white font-medium rounded hover:bg-accent-hover transition-fast flex items-center gap-2"
              >
                <Plus size={16} /> Add Announcements
              </button>
              <button
                onClick={loadSamples}
                className="px-5 py-2.5 bg-surface text-ink border border-muted font-medium rounded hover:bg-muted transition-fast flex items-center gap-2"
              >
                <FileText size={16} /> Load Sample Data
              </button>
            </div>
            <p className="text-xs text-secondary mt-4">
              {geminiConfigured
                ? `✓ ${providerLabel} connected — live ticker generation available`
                : '⚡ Demo mode — prewritten sample tickers will be used'}
            </p>
          </div>
        ) : (
          /* Story list */
          <div className="space-y-4">
            {/* Actions bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <button
                    onClick={generateAll}
                    disabled={isGenerating}
                    className="text-sm px-4 py-2 bg-accent text-white font-medium rounded hover:bg-accent-hover transition-fast flex items-center gap-2 disabled:opacity-50"
                  >
                    {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
                    Generate {pendingCount} Ticker{pendingCount > 1 ? 's' : ''}
                  </button>
                )}
                <button
                  onClick={() => setShowImporter(true)}
                  className="text-sm px-3 py-2 text-secondary hover:text-ink hover:bg-muted rounded transition-fast flex items-center gap-1.5"
                >
                  <Plus size={14} /> Add More
                </button>
                <button
                  onClick={loadSamples}
                  className="text-sm px-3 py-2 text-secondary hover:text-ink hover:bg-muted rounded transition-fast flex items-center gap-1.5"
                >
                  <FileText size={14} /> Load Samples
                </button>
                <button
                  onClick={newSession}
                  disabled={totalStories === 0}
                  className="text-sm px-3 py-2 text-secondary hover:text-error hover:bg-error/10 rounded transition-fast flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Discard all stories and start a fresh session"
                >
                  <Trash2 size={14} /> New Session
                </button>
              </div>

              {/* Tag / category filter */}
              {allFilterLabels.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setTagFilter(null)}
                    className={`text-xs px-2 py-1 rounded transition-fast border ${
                      tagFilter === null
                        ? 'bg-ink text-white border-ink'
                        : 'border-muted text-secondary hover:text-ink hover:bg-muted'
                    }`}
                  >
                    All ({totalStories})
                  </button>
                  {allFilterLabels.map(label => {
                    const count = stories.filter(s => s.tags.includes(label) || s.category === label).length;
                    const active = tagFilter === label;
                    return (
                      <button
                        key={label}
                        onClick={() => setTagFilter(active ? null : label)}
                        className={`text-xs px-2 py-1 rounded transition-fast border font-mono ${
                          active
                            ? 'bg-accent text-white border-accent'
                            : 'border-muted text-secondary hover:text-ink hover:bg-muted'
                        }`}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {!geminiConfigured && (
                <span className="text-xs font-mono text-secondary bg-muted px-2 py-1 rounded">
                  DEMO MODE — No API key
                </span>
              )}
            </div>

            {/* Story cards */}
            {visibleStories.length === 0 ? (
              <div className="text-sm text-secondary py-8 text-center">
                No stories match <span className="font-mono font-medium">"{tagFilter}"</span>.
                <button onClick={() => setTagFilter(null)} className="ml-2 text-accent hover:underline">
                  Show all
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleStories.map(story => {
                  // Global position in the full list so reorder stays stable under filtering
                  const index = stories.findIndex(s => s.sourceId === story.sourceId);
                  return (
                    <StoryCard
                      key={story.sourceId}
                      story={story}
                      index={index}
                      totalStories={totalStories}
                      onEdit={editTicker}
                      onApprove={approveTicker}
                      onReject={rejectTicker}
                      onRegenerate={regenerateOne}
                      onRestoreOption={restoreTickerOption}
                      onDeleteOption={deleteTickerOption}
                      onUndo={undoTicker}
                      onRevert={revertTicker}
                      onTagsChange={setTags}
                      onMoveUp={(id) => moveStory(id, 'up')}
                      onMoveDown={(id) => moveStory(id, 'down')}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Broadcast Preview ────────────────────────────────────────── */}
      <BroadcastPreview stories={stories} />

      {/* ── Import Modal ─────────────────────────────────────────────── */}
      {showImporter && (
        <BatchImporter onImport={addStories} onClose={() => setShowImporter(false)} />
      )}

      {/* ── Toast ────────────────────────────────────────────────────── */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default App;
