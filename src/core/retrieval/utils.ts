/**
 * Retrieval Utilities
 */

/**
 * Normalize content for display by replacing newlines with spaces.
 * Used for both JSON and formatted output to ensure consistent single-line content.
 */
export function normalizeContent(content: string): string {
  return content.replace(/\n+/g, ' ').trim();
}
