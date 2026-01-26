/**
 * XML Formatter for Retrieval Output
 *
 * Converts RetrievalOutput to clean XML structure for LLM consumption.
 * No escaping - the LLM reads this as structured text, not an XML parser.
 *
 * Design decisions:
 * - Attributes for dates and metadata (compact)
 * - Elements for text content (handles long text naturally)
 * - Pretty-printed with 2-space indentation
 * - Omits null/empty values
 * - Omits IDs (not useful for LLM)
 * - Filters out well-known entities
 * - No XML escaping (LLM understands context)
 */

import type { EntityData, InvalidatedMemory, MemoryData, RetrievalOutput } from '@/core';

/**
 * Format retrieval output as XML.
 *
 * @param output - Structured retrieval output
 * @returns XML string (without <memento> wrapper - that's added by wrapInMementoTags)
 */
export function formatRetrievalAsXML(output: RetrievalOutput): string {
  const lines: string[] = [];

  // Current date for temporal calculations
  const today = new Date().toISOString().split('T')[0];
  lines.push(`<current-date>${today}</current-date>`);
  lines.push('');

  // Query
  lines.push(`<query>${output.query}</query>`);
  lines.push('');

  // Entities section - filter out well-known entities
  const referencedEntities = output.entities.filter((e) => e.memoryCount > 0 && !e.isWellKnown);

  if (referencedEntities.length > 0) {
    lines.push('<entities>');
    for (const entity of referencedEntities) {
      lines.push(...formatEntity(entity, 1));
    }
    lines.push('</entities>');
    lines.push('');
  }

  // Memories section
  if (output.memories.length > 0) {
    lines.push('<memories>');
    for (const memory of output.memories) {
      lines.push(...formatMemory(memory, 1));
    }
    lines.push('</memories>');
  }

  return lines.join('\n');
}

/**
 * Format a single entity.
 */
function formatEntity(entity: EntityData, indent: number): string[] {
  const lines: string[] = [];
  const ind = '  '.repeat(indent);

  const typeLabel = entity.isUser ? 'User' : entity.type;
  const attrs = `name="${entity.name}" type="${typeLabel}"`;

  // If entity has description, use multi-line format
  if (entity.description) {
    lines.push(`${ind}<entity ${attrs}>`);
    lines.push(`${ind}  <description>${entity.description}</description>`);
    lines.push(`${ind}</entity>`);
  } else {
    // Self-closing tag for entities without description
    lines.push(`${ind}<entity ${attrs} />`);
  }

  return lines;
}

/**
 * Format a single memory with all its context.
 */
function formatMemory(memory: MemoryData, indent: number): string[] {
  const lines: string[] = [];
  const ind = '  '.repeat(indent);

  // Build opening tag with valid_since attribute (if present)
  let attrs = '';
  if (memory.validAt) {
    const validDate = formatDate(memory.validAt);
    attrs = ` valid_since="${validDate}"`;
  }

  lines.push(`${ind}<memory${attrs}>`);

  // Content
  lines.push(`${ind}  <content>${memory.content}</content>`);

  // About entities
  if (memory.about.length > 0) {
    lines.push(`${ind}  <about>`);
    for (const entityName of memory.about) {
      lines.push(`${ind}    <entity>${entityName}</entity>`);
    }
    lines.push(`${ind}  </about>`);
  }

  // Invalidates section
  if (memory.invalidates && memory.invalidates.length > 0) {
    lines.push(`${ind}  <invalidates>`);
    for (const invalidation of memory.invalidates) {
      lines.push(...formatInvalidation(invalidation, indent + 2));
    }
    lines.push(`${ind}  </invalidates>`);
  }

  // Provenance section
  if (memory.extractedFrom) {
    const { noteContent, noteTimestamp } = memory.extractedFrom;
    const noteDate = formatDate(noteTimestamp);

    lines.push(`${ind}  <extracted_from timestamp="${noteDate}">`);
    lines.push(`${ind}    <content>${noteContent}</content>`);
    lines.push(`${ind}  </extracted_from>`);
  }

  lines.push(`${ind}</memory>`);

  return lines;
}

/**
 * Format an invalidated memory (supports 2-hop chain).
 */
function formatInvalidation(invalidation: InvalidatedMemory, indent: number): string[] {
  const lines: string[] = [];
  const ind = '  '.repeat(indent);

  // Build opening tag with date attributes
  const attrs: string[] = [];
  if (invalidation.validAt) {
    attrs.push(`valid_since="${formatDate(invalidation.validAt)}"`);
  }
  if (invalidation.invalidatedAt) {
    attrs.push(`valid_until="${formatDate(invalidation.invalidatedAt)}"`);
  }
  const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';

  lines.push(`${ind}<memory${attrStr}>`);

  // Content
  lines.push(`${ind}  <content>${invalidation.content}</content>`);

  // Reason (only if present)
  if (invalidation.reason) {
    lines.push(`${ind}  <reason>${invalidation.reason}</reason>`);
  }

  // Hop 2 invalidations (if present)
  if (invalidation.invalidated && invalidation.invalidated.length > 0) {
    lines.push(`${ind}  <invalidates>`);
    for (const hop2 of invalidation.invalidated) {
      // Format hop 2 memory (no further nesting)
      const hop2Attrs: string[] = [];
      if (hop2.validAt) {
        hop2Attrs.push(`valid_since="${formatDate(hop2.validAt)}"`);
      }
      if (hop2.invalidatedAt) {
        hop2Attrs.push(`valid_until="${formatDate(hop2.invalidatedAt)}"`);
      }
      const hop2AttrStr = hop2Attrs.length > 0 ? ` ${hop2Attrs.join(' ')}` : '';

      lines.push(`${ind}    <memory${hop2AttrStr}>`);
      lines.push(`${ind}      <content>${hop2.content}</content>`);

      if (hop2.reason) {
        lines.push(`${ind}      <reason>${hop2.reason}</reason>`);
      }

      lines.push(`${ind}    </memory>`);
    }
    lines.push(`${ind}  </invalidates>`);
  }

  lines.push(`${ind}</memory>`);

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
    if (Number.isNaN(date.getTime())) return isoString;
    const parts = date.toISOString().split('T');
    return parts[0] ?? isoString;
  } catch {
    return isoString;
  }
}
