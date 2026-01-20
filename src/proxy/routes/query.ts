/**
 * Query Extraction
 *
 * Extracts user message content from request bodies, filtering out system injections.
 * Handles both OpenAI and Anthropic message formats.
 */

import type { AnthropicRequestBody, ContentBlock, OpenAIRequestBody } from '@/proxy/types';

/**
 * Known system injection tags to filter out when extracting user content.
 * These are prefixes added by various systems that shouldn't be treated as user queries.
 */
const SYSTEM_TAGS = ['<memento>', '<system-reminder>', '<system>', '<instructions>'];

/**
 * Extract the query text from a request body.
 *
 * Finds the last user message and extracts the actual user content,
 * filtering out injected system tags and memento content.
 *
 * @param body - Request body (OpenAI or Anthropic format)
 * @returns The extracted user query, or null if no user message found
 */
export function extractQueryFromBody(
  body: OpenAIRequestBody | AnthropicRequestBody
): string | null {
  if (!body.messages || body.messages.length === 0) {
    return null;
  }

  // Find the last user message
  for (let i = body.messages.length - 1; i >= 0; i--) {
    const msg = body.messages[i];
    if (msg?.role === 'user') {
      return extractUserContent(msg.content);
    }
  }

  return null;
}

/**
 * Extract user content from message content (string or array).
 * Filters out system-injected blocks/sections.
 */
function extractUserContent(content: string | ContentBlock[]): string | null {
  if (typeof content === 'string') {
    return extractFromString(content);
  }

  if (Array.isArray(content)) {
    return extractFromArray(content);
  }

  return null;
}

/**
 * Extract user message from a string that may contain injected content.
 * - Skips past </memento> if present (memento content is prepended)
 * - Stops before known system tags
 */
function extractFromString(content: string): string | null {
  let text = content;

  // Skip past </memento> block (memento content is prepended to user message)
  const mementoEnd = text.indexOf('</memento>');
  if (mementoEnd !== -1) {
    text = text.substring(mementoEnd + '</memento>'.length);
  }

  // Stop before any system injection tag
  let cutoff = text.length;
  for (const tag of SYSTEM_TAGS) {
    const idx = text.indexOf(tag);
    if (idx !== -1 && idx < cutoff) {
      cutoff = idx;
    }
  }

  const result = text.substring(0, cutoff).trim();
  return result.length > 0 ? result : null;
}

/**
 * Extract user message from an array of content blocks.
 * Filters out blocks that are system injections (start with known tags).
 */
function extractFromArray(content: ContentBlock[]): string | null {
  const userBlocks = content.filter((block) => {
    if (block.type !== 'text' || !block.text) return false;
    const text = block.text.trim();

    // Filter out blocks that start with system tags
    for (const tag of SYSTEM_TAGS) {
      if (text.startsWith(tag)) return false;
    }

    return true;
  });

  if (userBlocks.length === 0) return null;

  const combined = userBlocks
    .map((b) => b.text)
    .join(' ')
    .trim();

  return combined.length > 0 ? combined : null;
}
