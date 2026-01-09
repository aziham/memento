/**
 * Embedding Provider Utilities
 *
 * Shared utilities for embedding client implementations.
 */

/**
 * L2 normalize a vector to unit length.
 * Returns a new array - does not mutate input.
 *
 * @param vector - The vector to normalize
 * @returns L2 normalized vector (unit length)
 */
export function normalizeL2(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector;
  return vector.map((val) => val / magnitude);
}
