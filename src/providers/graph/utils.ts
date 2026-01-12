/**
 * Graph Provider Utilities
 *
 * Helper functions for the Neo4j graph provider.
 */

/**
 * Generate a UUID v7 (time-ordered, sortable).
 * Uses Bun's built-in implementation.
 */
export function generateId(): string {
  return Bun.randomUUIDv7();
}

/**
 * Get current timestamp in ISO 8601 format.
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Lucene special characters that need escaping in fulltext queries.
 * @see https://lucene.apache.org/core/9_0_0/queryparser/org/apache/lucene/queryparser/classic/package-summary.html
 */
const LUCENE_SPECIAL_CHARS = /[+\-&|!(){}[\]^"~*?:\\/]/g;

/**
 * Sanitize a query string for Lucene fulltext search.
 * Escapes special characters that have meaning in Lucene query syntax.
 *
 * @param query - The raw search query
 * @returns Escaped query safe for Lucene
 */
export function sanitizeLucene(query: string): string {
  return query.replace(LUCENE_SPECIAL_CHARS, '\\$&');
}

/**
 * Check if a value is a valid ISO 8601 timestamp.
 */
export function isValidTimestamp(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

/**
 * Reciprocal Rank Fusion - combines multiple ranked lists.
 *
 * RRF score = Σ 1/(rank + k) for each list where item appears.
 *
 * @param lists - Array of ranked result lists (each item needs an `id` field)
 * @param k - Ranking constant (default: 1)
 * @returns Combined results sorted by RRF score, with scores
 */
export function rrfFusion<T extends { id: string }>(
  lists: T[][],
  k: number = 1
): Array<{ item: T; score: number }> {
  const scores = new Map<string, { item: T; score: number }>();

  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      if (!item) continue;

      const rrfScore = 1 / (rank + k);

      const existing = scores.get(item.id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(item.id, { item, score: rrfScore });
      }
    }
  }

  return Array.from(scores.values()).sort((a, b) => b.score - a.score);
}
