/**
 * Retrieval Output Formatter
 *
 * Formats RetrievalOutput as a human/LLM-readable string with tree-style layout.
 */

import type { InvalidatedMemory, MemoryData, RetrievalOutput } from './types';
import { normalizeContent } from './utils';

/**
 * Format retrieval output as a human/LLM-readable string.
 *
 * Uses tree-style layout with:
 * - `├─` for items with siblings below
 * - `└─` for last item in a group
 * - `│` for vertical continuation
 *
 * @param output - Structured retrieval output
 * @returns Formatted string
 *
 * @example
 * ```
 * # Retrieved Context
 *
 * Query: "What JavaScript runtime do I use?"
 *
 * ## Entities
 *
 * [Hamza] (User)
 * ├─ Description: Software engineer based in San Francisco
 * └─ Referenced by: 3 memories
 *
 * [Bun] (Technology)
 * ├─ Description: A fast JavaScript runtime and toolkit
 * └─ Referenced by: 2 memories
 *
 * ## Memories
 *
 * [M1] abc-123
 * ├─ Content: "Hamza prefers Bun over Node.js"
 * ├─ About: Hamza, Bun, Node.js
 * └─ Valid since: 2024-01-15
 * ```
 */
export function formatRetrievalOutput(output: RetrievalOutput): string {
  const lines: string[] = [];

  // Header
  lines.push('# Retrieved Context');
  lines.push('');
  lines.push(`Query: "${output.query}"`);
  lines.push('');

  // Entities section - only show entities that:
  // 1. Are referenced by at least one memory (memoryCount > 0)
  // 2. Are NOT well-known (isWellKnown: false) - LLMs already know about well-known entities
  const referencedEntities = output.entities.filter((e) => e.memoryCount > 0 && !e.isWellKnown);
  if (referencedEntities.length > 0) {
    lines.push('## Entities');
    lines.push('');

    for (const entity of referencedEntities) {
      const typeLabel = entity.isUser ? 'User' : entity.type;
      lines.push(`[${entity.name}] (${typeLabel})`);

      if (entity.description) {
        lines.push(`├─ Description: ${entity.description}`);
      }

      const memoryWord = entity.memoryCount === 1 ? 'memory' : 'memories';
      lines.push(`└─ Referenced by: ${entity.memoryCount} ${memoryWord}`);
      lines.push('');
    }
  }

  // Memories section
  if (output.memories.length > 0) {
    lines.push('## Memories');
    lines.push('');

    for (const memory of output.memories) {
      lines.push(...formatMemory(memory));
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format a single memory with all its context.
 */
function formatMemory(memory: MemoryData): string[] {
  const lines: string[] = [];

  // Header line
  lines.push(`[M${memory.rank}] ${memory.id}`);

  // Determine what sections we have to know which is last
  const hasInvalidates = memory.invalidates && memory.invalidates.length > 0;
  const hasProvenance = memory.extractedFrom !== undefined;

  // Content
  lines.push(`├─ Content: "${normalizeContent(memory.content)}"`);

  // About
  if (memory.about.length > 0) {
    lines.push(`├─ About: ${memory.about.join(', ')}`);
  }

  // Valid since
  if (memory.validAt) {
    const validDate = formatDate(memory.validAt);
    lines.push(`├─ Valid since: ${validDate}`);
  }

  // Invalidates section
  if (hasInvalidates) {
    const isLast = !hasProvenance;
    const prefix = isLast ? '└─' : '├─';
    const continuation = isLast ? '   ' : '│  ';

    lines.push(`${prefix} Invalidates:`);
    lines.push(...formatInvalidatesSection(memory.invalidates!, continuation));
  }

  // Provenance section (always last if present)
  if (hasProvenance) {
    lines.push('└─ Extracted from:');
    lines.push(...formatProvenanceSection(memory.extractedFrom!));
  }

  return lines;
}

/**
 * Format the invalidates section with 2-hop chain.
 */
function formatInvalidatesSection(
  invalidates: InvalidatedMemory[],
  continuation: string
): string[] {
  const lines: string[] = [];

  for (const [invalidationIndex, invalidation] of invalidates.entries()) {
    const isLastInvalidation = invalidationIndex === invalidates.length - 1;
    const invalidationPrefix = isLastInvalidation ? '└─' : '├─';
    const invalidationContinuation = isLastInvalidation ? '   ' : '│  ';

    const invalidatedDate = formatDate(invalidation.invalidatedAt);
    lines.push(
      `${continuation}${invalidationPrefix} ${invalidation.id} (invalidated: ${invalidatedDate})`
    );

    // Hop 1 details
    const hop2List = invalidation.invalidated ?? [];
    const hasHop2 = hop2List.length > 0;
    const hop1Prefix = `${continuation}${invalidationContinuation}`;

    lines.push(`${hop1Prefix}├─ Content: "${normalizeContent(invalidation.content)}"`);

    if (hasHop2) {
      lines.push(`${hop1Prefix}├─ Reason: ${invalidation.reason ?? 'unknown'}`);
      lines.push(`${hop1Prefix}└─ Invalidated:`);

      // Hop 2 entries
      for (const [hop2Index, hop2] of hop2List.entries()) {
        const isLastHop2 = hop2Index === hop2List.length - 1;
        const hop2Prefix = isLastHop2 ? '└─' : '├─';
        const hop2Continuation = isLastHop2 ? '   ' : '│  ';

        const hop2Date = formatDate(hop2.invalidatedAt);
        lines.push(`${hop1Prefix}   ${hop2Prefix} ${hop2.id} (invalidated: ${hop2Date})`);
        lines.push(
          `${hop1Prefix}   ${hop2Continuation}├─ Content: "${normalizeContent(hop2.content)}"`
        );
        lines.push(`${hop1Prefix}   ${hop2Continuation}└─ Reason: ${hop2.reason ?? 'unknown'}`);
      }
    } else {
      lines.push(`${hop1Prefix}└─ Reason: ${invalidation.reason ?? 'unknown'}`);
    }
  }

  return lines;
}

/**
 * Format the provenance section.
 */
function formatProvenanceSection(provenance: {
  noteId: string;
  noteContent: string;
  noteTimestamp: string;
}): string[] {
  const lines: string[] = [];
  const noteDate = formatDate(provenance.noteTimestamp);

  lines.push(`   └─ Note ${provenance.noteId} (${noteDate})`);
  lines.push(`      └─ Content: "${normalizeContent(provenance.noteContent)}"`);

  return lines;
}

/**
 * Format an ISO date string for display.
 * Returns just the date part (YYYY-MM-DD) for brevity.
 * Preserves the original date from the string rather than converting to UTC.
 */
function formatDate(isoString: string | null): string {
  if (!isoString) return 'unknown';

  // Extract date directly from ISO string to preserve original date (avoid UTC conversion)
  // e.g., "2024-01-15T23:00:00-05:00" → "2024-01-15" (not "2024-01-16" in UTC)
  const dateMatch = isoString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch?.[1]) return dateMatch[1];

  // Fallback: try to parse and format (will convert to UTC)
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    const parts = date.toISOString().split('T');
    return parts[0] ?? isoString;
  } catch {
    return isoString;
  }
}
