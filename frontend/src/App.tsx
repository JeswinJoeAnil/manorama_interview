import { useState, useCallback, useEffect, useRef } from 'react';
import {
  FileText, Upload, Loader2, Check, X, AlertTriangle,
  ChevronDown, ChevronUp, RotateCcw, Download, Plus,
  Radio, Wifi, WifiOff, Eye, EyeOff, ArrowUp, ArrowDown,
  ClipboardPaste, FileUp, Newspaper, AlertCircle, CheckCircle2,
  Type
} from 'lucide-react';
import type { Story, ValidationIssue } from './types';
import { countWords, MAX_WORDS } from './utils/wordCount';
import { buildExportPayload, downloadJson, getExportableCount } from './utils/exportJson';
import { SAMPLE_ANNOUNCEMENTS, createStoryFromSource, generateId } from './utils/sampleData';
import { checkHealth, generateTickers } from './services/api';

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
}) {
  const [expanded, setExpanded] = useState(false);
  const [showIssues, setShowIssues] = useState(false);

  const isGenerating = story.status === 'generating';
  const hasTicker = story.tickerText.trim().length > 0;
  const canApprove = story.isValid && hasTicker && !isGenerating;

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

        {/* Title / category */}
        <div className="flex-1 min-w-0">
          {story.sourceTitle && (
            <span className="font-malayalam text-sm font-semibold text-ink truncate block">
              {story.sourceTitle}
            </span>
          )}
          {story.category && (
            <span className="font-mono text-xs text-secondary">{story.category}</span>
          )}
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
  onImport: (stories: Omit<Story, 'tickerText' | 'keyFact' | 'wordCount' | 'validationIssues' | 'isValid' | 'isApproved' | 'needsReview' | 'isDemo' | 'status' | 'editVersion'>[]) => void;
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
  const [stories, setStories] = useState<Story[]>([]);
  const [batchId] = useState(() => `batch-${Date.now()}`);
  const [batchTitle] = useState('Editorial Session');
  const [isConnected, setIsConnected] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [modelName, setModelName] = useState('');
  const [showImporter, setShowImporter] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const generationVersionRef = useRef<Map<string, number>>(new Map());

  // Health check on mount
  useEffect(() => {
    const check = async () => {
      try {
        const health = await checkHealth();
        setIsConnected(true);
        setGeminiConfigured(health.gemini_configured);
        setModelName(health.model);
      } catch {
        setIsConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Story management ──────────────────────────────────────────────────

  const addStories = useCallback((sources: Omit<Story, 'tickerText' | 'keyFact' | 'wordCount' | 'validationIssues' | 'isValid' | 'isApproved' | 'needsReview' | 'isDemo' | 'status' | 'editVersion'>[]) => {
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
      const wc = countWords(text);
      const isOverLimit = wc > MAX_WORDS;
      const isEmpty = !text.trim();
      const validationIssues: ValidationIssue[] = [];
      if (isEmpty) validationIssues.push({ type: 'error', code: 'EMPTY_TICKER', message: 'Ticker text is empty.' });
      if (isOverLimit) validationIssues.push({ type: 'error', code: 'WORD_COUNT_EXCEEDED', message: `Ticker has ${wc} words (maximum is ${MAX_WORDS}).` });
      const isValid = !isEmpty && !isOverLimit;
      return {
        ...s,
        tickerText: text,
        wordCount: wc,
        validationIssues,
        isValid,
        isApproved: isValid ? s.isApproved : false, // Auto-revoke if invalid
        status: 'editing' as const,
        editVersion: s.editVersion + 1,
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

        return {
          ...s,
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
        };
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

        return {
          ...s,
          tickerText: result.ticker,
          keyFact: result.key_fact,
          reviewNote: result.review_note || undefined,
          needsReview: result.needs_review,
          wordCount: result.word_count,
          validationIssues: result.validation_issues,
          isValid: result.is_valid,
          isDemo: result.is_demo,
          status: 'generated' as const,
          isApproved: false,
        };
      }));
    } catch (err: any) {
      setStories(prev => prev.map(s =>
        s.sourceId === sourceId ? { ...s, status: 'error' as const, error: err.message } : s
      ));
    }
  }, [stories]);

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
                      {geminiConfigured ? `Gemini (${modelName || 'live'})` : 'Demo Mode'}
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
                ? '✓ Gemini API connected — live ticker generation available'
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
              </div>

              {!geminiConfigured && (
                <span className="text-xs font-mono text-secondary bg-muted px-2 py-1 rounded">
                  DEMO MODE — No API key
                </span>
              )}
            </div>

            {/* Story cards */}
            <div className="space-y-3">
              {stories.map((story, index) => (
                <StoryCard
                  key={story.sourceId}
                  story={story}
                  index={index}
                  totalStories={totalStories}
                  onEdit={editTicker}
                  onApprove={approveTicker}
                  onReject={rejectTicker}
                  onRegenerate={regenerateOne}
                  onMoveUp={(id) => moveStory(id, 'up')}
                  onMoveDown={(id) => moveStory(id, 'down')}
                />
              ))}
            </div>
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
