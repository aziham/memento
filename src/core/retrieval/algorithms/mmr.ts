/**
 * MMR (Maximal Marginal Relevance) Algorithms
 *
 * Diversity-aware reranking for the DISTILL phase.
 * Balances relevance and diversity using adaptive lambda.
 */

import type { RetrievalConfig } from '../config';
import type { ScoredMemory } from '../types';
import { computeCosineSimilarity } from './similarity';

/**
 * Compute adaptive MMR lambda based on score distribution.
 *
 * Large gap between top score and average = clear winner = favor relevance (high λ)
 * Small gap = many similar results = favor diversity (low λ)
 *
 * @param results - Scored results (should be sorted by score descending)
 * @param config - Retrieval config with distill.lambda.min/max settings
 * @returns Lambda value in [config.distill.lambda.min, config.distill.lambda.max]
 *
 * @example
 * // Clear winner: "my email address"
 * // Scores: [0.95, 0.42, 0.38, 0.35], gap = 0.43
 * computeAdaptiveLambda(results, config) // → 0.7 (favor relevance)
 *
 * // Many similar: "my coding preferences"
 * // Scores: [0.78, 0.75, 0.73, 0.71], gap = 0.04
 * computeAdaptiveLambda(results, config) // → 0.5 (favor diversity)
 */
export function computeAdaptiveLambda(results: ScoredMemory[], config: RetrievalConfig): number {
  const { min, max } = config.distill.lambda;
  const defaultLambda = (min + max) / 2;

  if (results.length === 0) return defaultLambda;

  const scores = results.map((r) => r.score);
  const topScore = scores[0] ?? 0;
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const gap = topScore - avgScore;

  // Map gap to lambda within configured range
  // gap > 0.3 → max lambda (favor relevance)
  // gap < 0.1 → min lambda (favor diversity)
  if (gap > 0.3) return max;
  if (gap > 0.2) return (max + min) / 2 + 0.05;
  if (gap > 0.1) return (max + min) / 2;
  return min;
}

/**
 * Rerank results using Maximal Marginal Relevance (MMR).
 *
 * MMR balances relevance and diversity:
 *   MMR(d) = λ * relevance(d) - (1-λ) * max_similarity(d, selected)
 *
 * Higher λ favors relevance, lower λ favors diversity.
 *
 * @param candidates - Candidate results sorted by score descending
 * @param lambda - Balance parameter (0 = pure diversity, 1 = pure relevance)
 * @param topK - Number of results to return
 * @returns Top K diverse results
 */
export function mmrRerank(
  candidates: ScoredMemory[],
  lambda: number,
  topK: number
): ScoredMemory[] {
  if (candidates.length <= topK) return candidates;

  const selected: ScoredMemory[] = [];
  const remaining = [...candidates];

  // First: pick highest scoring
  const first = remaining.shift();
  if (!first) return selected;
  selected.push(first);

  while (selected.length < topK && remaining.length > 0) {
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestIdx = 0;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (!candidate) continue;

      // Relevance: original score
      const relevance = candidate.score;

      // Diversity: max similarity to already selected
      // Lower max similarity = more diverse
      let maxSimilarity = 0;
      for (const selectedMemory of selected) {
        const candidateEmbedding = candidate.result.embedding;
        const selectedEmbedding = selectedMemory.result.embedding;

        if (candidateEmbedding && selectedEmbedding) {
          const similarity = computeCosineSimilarity(candidateEmbedding, selectedEmbedding);
          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
          }
        }
      }

      // MMR score: balance relevance and diversity
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    // Move best candidate from remaining to selected
    const best = remaining.splice(bestIdx, 1)[0];
    if (best) {
      selected.push(best);
    }
  }

  return selected;
}
