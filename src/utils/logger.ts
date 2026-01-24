/**
 * Logger
 *
 * Semantic logging for Memento operations:
 * - STORE: Note consolidation (adding memories to the graph)
 * - RECALL: Memory retrieval (querying the graph)
 *
 * Design principles:
 * - Action-oriented verbs (Added, Replaced, Skipped)
 * - Clear visual hierarchy with minimal nesting
 * - Show what matters, hide implementation details
 */

import type { ConsolidationOutput, MemoryDecision } from '@/core';
import type { RetrievalOutput } from '@/core/retrieval/types';
import { c } from './colors';

// ═══════════════════════════════════════════════════════════════════════════════
// Formatting Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/** Format current time as [HH:MM:SS] */
function formatTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `[${hours}:${minutes}:${seconds}]`;
}

/** Truncate text to max length with ellipsis */
function truncate(text: string, maxLength: number): string {
  // Normalize whitespace (collapse newlines and multiple spaces)
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

/** Indent string for continuation lines (matches timestamp width) */
const INDENT = '           '; // 11 chars to align with [HH:MM:SS] + space

// ═══════════════════════════════════════════════════════════════════════════════
// Note Storage Logging (STORE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log the start of a note storage operation.
 */
export function logNoteStorageStart(content: string): void {
  const time = c.dim(formatTime());
  const preview = truncate(content, 60);
  console.log(`${time} ${c.cyan('STORE')} "${c.white(preview)}"`);
}

/**
 * Log the result of a note storage operation.
 */
export function logNoteStorageResult(output: ConsolidationOutput): void {
  // Handle skipped notes
  if (output.skipped) {
    console.log(`${INDENT}${c.yellow('⊘ Skipped')} ${c.dim(`(${output.skipReason})`)}`);
    return;
  }

  const { memories, entities } = output.result;

  // Log memory decisions by action type
  logMemoryActions(memories);

  // Log entity summary
  logEntitySummary(entities);
}

/**
 * Log memory actions grouped by type.
 */
function logMemoryActions(memories: MemoryDecision[]): void {
  for (const memory of memories) {
    const preview = truncate(memory.content, 55);

    switch (memory.action) {
      case 'ADD':
        console.log(`${INDENT}${c.brightGreen('+ Added')}: "${c.white(preview)}"`);
        break;

      case 'SKIP':
        console.log(
          `${INDENT}${c.yellow('= Skipped')}: "${c.dim(preview)}" ${c.dim(`(${memory.reason})`)}`
        );
        break;

      case 'INVALIDATE':
        // Show the new memory being added
        console.log(`${INDENT}${c.brightGreen('+ Added')}: "${c.white(preview)}"`);
        // Show what it replaces
        if (memory.invalidates && memory.invalidates.length > 0) {
          for (const target of memory.invalidates) {
            const shortId = target.existingMemoryId.slice(0, 8);
            console.log(
              `${INDENT}${c.brightRed('- Replaced')}: ${c.dim(`[${shortId}]`)} ${c.dim(target.reason)}`
            );
          }
        }
        break;
    }
  }
}

/**
 * Log entity summary on one line.
 */
function logEntitySummary(entities: { name: string; action: 'CREATE' | 'MATCH' }[]): void {
  if (entities.length === 0) return;

  const parts = entities.map((e) => {
    const tag = e.action === 'CREATE' ? c.cyan('new') : c.dim('matched');
    return `${e.name} (${tag})`;
  });

  console.log(`${INDENT}${c.dim('→ Entities:')} ${parts.join(', ')}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Memory Retrieval Logging (RECALL)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log the start of a memory retrieval operation.
 */
export function logRetrievalStart(query: string): void {
  const time = c.dim(formatTime());
  const preview = truncate(query, 60);
  console.log(`${time} ${c.magenta('RECALL')} "${c.white(preview)}"`);
}

/**
 * Log the result of a memory retrieval operation.
 */
export function logRetrievalResult(result: RetrievalOutput): void {
  // Show entities if any
  if (result.entities.length > 0) {
    const names = result.entities.map((e) => e.name).join(', ');
    console.log(`${INDENT}${c.dim('→')} ${names}`);
  }

  // Show memories (numbered list)
  if (result.memories.length === 0) {
    console.log(`${INDENT}${c.dim('(no memories found)')}`);
    return;
  }

  for (const memory of result.memories) {
    const num = c.dim(`[${memory.rank}]`);
    const preview = truncate(memory.content, 60);
    const score = c.dim(`(${memory.score.toFixed(2)})`);
    console.log(`${INDENT}${num} "${c.white(preview)}" ${score}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════════════════════

export { displayBanner } from './banner';
export { buildStartupInfo, displayStartup } from './startup';
