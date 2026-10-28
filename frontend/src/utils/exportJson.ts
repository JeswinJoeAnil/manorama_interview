/**
 * JSON export utility for approved tickers.
 */

import type { Story, ExportPayload, ExportTicker } from '../types';
import { countWords } from './wordCount';

export function buildExportPayload(
  stories: Story[],
  batchId: string
): ExportPayload {
  const approvedStories = stories.filter(
    s => s.isApproved && s.isValid && s.tickerText.trim()
  );
  
  const tickers: ExportTicker[] = approvedStories.map((story, index) => ({
    ticker_id: `ticker-${story.sourceId}`,
    source_id: story.sourceId,
    text: story.tickerText.trim(),
    word_count: countWords(story.tickerText),
    position: index + 1,
    category: story.category,
    tags: story.tags.length > 0 ? story.tags : undefined,
    approved: true as const,
  }));
  
  return {
    schema_version: '1.0',
    batch_id: batchId,
    exported_at: new Date().toISOString(),
    tickers,
  };
}

export function downloadJson(payload: ExportPayload): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `newswire-export-${payload.batch_id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getApprovedCount(stories: Story[]): number {
  return stories.filter(s => s.isApproved && s.isValid).length;
}

export function getExportableCount(stories: Story[]): number {
  return stories.filter(
    s => s.isApproved && s.isValid && s.tickerText.trim()
  ).length;
}
