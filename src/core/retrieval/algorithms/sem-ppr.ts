/**
 * Semantic-Enhanced Personalized PageRank (SEM-PPR).
 * Combines graph structure scores with semantic similarity.
 */

import type { EmbeddedRankedResult, SemanticPPRConfig } from '../types';
import { computeCosineSimilarity } from './similarity';

/**
 * Default SEM-PPR configuration.
 * Balanced 50/50 between structure and semantics.
 */
export const defaultSemanticPPRConfig: SemanticPPRConfig = {
  structureWeight: 0.5
};

/**
 * Apply semantic enhancement to Personalized PageRank results.
 * Combines structural (PPR) scores with semantic (cosine) similarity.
 *
 * Formula: hybridScore = α × structureScore + (1-α) × semanticScore
 * where α = structureWeight
 *
 * @param pprResults - Results from PPR graph traversal with structure scores
 * @param queryEmbedding - Query vector for semantic comparison
 * @param config - SEM-PPR configuration
 * @returns Results with hybrid structure+semantic scores
 */
export function applySemanticPPRBoost<T>(
  pprResults: EmbeddedRankedResult<T>[],
  queryEmbedding: number[],
  config: SemanticPPRConfig = defaultSemanticPPRConfig
): EmbeddedRankedResult<T>[] {
  const { structureWeight } = config;
  const semanticWeight = 1 - structureWeight;

  return pprResults.map((result) => {
    // If no embedding available, keep original structure score
    if (!result.embedding || result.embedding.length === 0) {
      return result;
    }

    // Compute semantic similarity
    const semanticScore = computeCosineSimilarity(queryEmbedding, result.embedding);

    // Combine structure and semantic scores
    const hybridScore = structureWeight * result.score + semanticWeight * semanticScore;

    return {
      ...result,
      score: hybridScore
    };
  });
}
