/**
 * Vector similarity computations.
 */

/**
 * Compute cosine similarity between two vectors.
 * Assumes vectors are L2 normalized (cosine similarity = dot product).
 *
 * @param vectorA - First vector
 * @param vectorB - Second vector
 * @returns Similarity score between -1 and 1 (1 = identical direction)
 */
export function computeCosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length === 0 || vectorB.length === 0 || vectorA.length !== vectorB.length) {
    return 0;
  }

  let dotProduct = 0;
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += (vectorA[i] ?? 0) * (vectorB[i] ?? 0);
  }

  return dotProduct;
}
