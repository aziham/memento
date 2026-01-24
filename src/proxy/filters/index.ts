/**
 * Request Filters
 *
 * Filters for identifying requests that should skip memory retrieval.
 * Used to filter out internal client requests (title generation, etc.)
 */

import { SKIP_PATTERNS } from './skip-patterns';

/**
 * Check if a query should skip memory retrieval.
 *
 * Returns true for internal client requests like title generation,
 * summarization, etc. These are not meaningful user queries and
 * should not trigger memory retrieval.
 *
 * @param query - The extracted user query
 * @returns true if retrieval should be skipped
 */
export function shouldSkipRetrieval(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return SKIP_PATTERNS.some((pattern) => lowerQuery.includes(pattern));
}
