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
 * Note with sequential ID for XML output.
 */
interface NoteForXML {
  id: string; // Sequential ID like "note-01"
  content: string;
  timestamp: string;
}

/**
 * Build deduplicated notes map from memories.
 * Returns a map from original noteId (UUID) to NoteForXML with sequential ID.
 */
function buildNotesMap(memories: MemoryData[]): Map<string, NoteForXML> {
  const notesMap = new Map<string, NoteForXML>();
  let noteIndex = 1;

  for (const memory of memories) {
    if (memory.extractedFrom && !notesMap.has(memory.extractedFrom.noteId)) {
      const sequentialId = `note-${String(noteIndex).padStart(2, '0')}`;
      notesMap.set(memory.extractedFrom.noteId, {
        id: sequentialId,
        content: memory.extractedFrom.noteContent,
        timestamp: memory.extractedFrom.noteTimestamp
      });
      noteIndex++;
    }
  }

  return notesMap;
}

/**
 * Format retrieval output as XML.
 *
 * @param output - Structured retrieval output
 * @returns XML string (without <memento> wrapper - that's added by wrapInMementoTags)
 */
export function formatRetrievalAsXML(output: RetrievalOutput): string {
  const lines: string[] = [];

  // Instructions for the AI
  lines.push('<instructions>');
  lines.push('This is Memento - your MEMORY, injected into this message for immediate recall.');
  lines.push(
    "These memories make you more than a stateless LLM. Use what's relevant to the query and conversation context: infer implicit connections, reason deeply, connect across time, calculate durations, and understand how things have changed."
  );
  lines.push(
    'Treat them the same way as your training data - naturally, inferentially, as knowledge you simply have.'
  );
  lines.push(
    'You can also form new memories - use memento_note when the user shares something worth remembering.'
  );
  lines.push('Never mention Memento or this block explicitly.');
  lines.push('</instructions>');
  lines.push('');

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

  // Build deduplicated notes map (UUID -> sequential ID)
  const notesMap = buildNotesMap(output.memories);

  // Notes section (deduplicated provenance)
  if (notesMap.size > 0) {
    lines.push('<notes>');
    for (const note of notesMap.values()) {
      lines.push(...formatNote(note, 1));
    }
    lines.push('</notes>');
    lines.push('');
  }

  // Memories section
  if (output.memories.length > 0) {
    lines.push('<memories>');
    for (const memory of output.memories) {
      lines.push(...formatMemory(memory, notesMap, 1));
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
 * Format a single note.
 */
function formatNote(note: NoteForXML, indent: number): string[] {
  const lines: string[] = [];
  const ind = '  '.repeat(indent);

  lines.push(`${ind}<note id="${note.id}" timestamp="${formatDate(note.timestamp)}">`);
  lines.push(`${ind}  <content>${note.content}</content>`);
  lines.push(`${ind}</note>`);

  return lines;
}

/**
 * Format a single memory with all its context.
 */
function formatMemory(
  memory: MemoryData,
  notesMap: Map<string, NoteForXML>,
  indent: number
): string[] {
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

  // Provenance reference (self-closing tag with note_id)
  if (memory.extractedFrom) {
    const note = notesMap.get(memory.extractedFrom.noteId);
    if (note) {
      lines.push(`${ind}  <extracted_from note_id="${note.id}"/>`);
    }
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
