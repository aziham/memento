/**
 * Semantic-Enhanced Personalized PageRank (SEM-PPR).
 *
 * Standard PPR finds nodes that are structurally close to anchor entities in the graph,
 * but structure alone can surface irrelevant results - a memory might be well-connected
 * to anchor entities but semantically unrelated to the query.
 *
 * SEM-PPR solves this by combining two signals:
 * 1. Structure score (PPR): How well-connected is this memory to anchor entities?
 * 2. Semantic score (cosine): How similar is this memory's content to the query?
 *
 * The hybrid score balances both signals, ensuring results are both graph-connected
 * AND semantically relevant. The 50/50 default weight treats both signals equally,
 * which works well empirically - neither pure structure nor pure semantics alone
 * provides optimal retrieval quality.
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
 *
 * PPR scores reflect graph distance from anchor entities - high scores mean the memory
 * is reachable through many short paths. But a memory about "Python" might be well-connected
 * to a "Programming" anchor while the user asked about "snake habitats".
 *
 * This function re-scores PPR results by blending structure with semantic similarity:
 * - structureWeight (α) controls how much graph connectivity matters
 * - semanticWeight (1-α) controls how much query similarity matters
 *
 * Memories without embeddings retain their original structure score unchanged,
 * ensuring we don't penalize nodes that couldn't be embedded.
 *
 * Formula: hybridScore = α × structureScore + (1-α) × semanticScore
 * where α = structureWeight (default 0.5)
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
