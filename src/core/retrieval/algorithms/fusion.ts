/**
 * Search result fusion algorithm.
 * Combines results from multiple search sources using distribution alignment
 * and weighted averaging.
 */

import type { RankedResult, RetrievalMethod, SearchFusionConfig } from '../types';
import { alignScoreDistribution, normalizeToUnitRange } from './normalize';

/**
 * Compute dynamic weights based on result coverage.
 * Reduces weight for sources with sparse results (coverage penalty).
 *
 * @param vectorResultCount - Number of results from vector search
 * @param fulltextResultCount - Number of results from fulltext search
 * @param config - Fusion configuration
 * @returns Normalized weights that sum to 1
 */
export function computeCoverageAdjustedWeights(
  vectorResultCount: number,
  fulltextResultCount: number,
  config: SearchFusionConfig
): { vectorWeight: number; fulltextWeight: number } {
  const { vectorWeight, fulltextWeight, minResultsForFullWeight } = config;

  // Coverage penalty: reduce weight for sparse result sets
  const vectorCoverage = Math.min(vectorResultCount / minResultsForFullWeight, 1);
  const fulltextCoverage = Math.min(fulltextResultCount / minResultsForFullWeight, 1);

  const adjustedVectorWeight = vectorWeight * vectorCoverage;
  const adjustedFulltextWeight = fulltextWeight * fulltextCoverage;

  // Normalize to sum to 1
  const totalWeight = adjustedVectorWeight + adjustedFulltextWeight;

  return {
    vectorWeight: adjustedVectorWeight / totalWeight,
    fulltextWeight: adjustedFulltextWeight / totalWeight
  };
}

/**
 * Fuse results from vector and fulltext search sources.
 *
 * Pipeline:
 * 1. Distribution alignment - align mean/std to handle different score distributions
 * 2. Min-max normalization - scale to 0-1 range
 * 3. Compute weights - base weights with coverage penalty
 * 4. Quality filter - exclude weak matches below threshold (optional)
 * 5. Weighted average - combine scores without multiplicative boost
 *
 * @param vectorResults - Results from vector (semantic) search
 * @param fulltextResults - Results from fulltext (keyword) search
 * @param vectorSource - Source label for vector-only results
 * @param fulltextSource - Source label for fulltext-only results
 * @param config - Fusion configuration
 * @returns Merged and scored results, sorted by score descending
 */
export function fuseSearchResults<T extends { id: string }>(
  vectorResults: RankedResult<T>[],
  fulltextResults: RankedResult<T>[],
  vectorSource: RetrievalMethod,
  fulltextSource: RetrievalMethod,
  config: SearchFusionConfig
): RankedResult<T>[] {
  // Handle empty inputs
  if (vectorResults.length === 0 && fulltextResults.length === 0) return [];
  if (vectorResults.length === 0) {
    return fulltextResults.map((r) => ({ ...r, source: fulltextSource }));
  }
  if (fulltextResults.length === 0) {
    return vectorResults.map((r) => ({ ...r, source: vectorSource }));
  }

  // Extract raw scores
  const vectorScores = vectorResults.map((r) => r.score);
  const fulltextScores = fulltextResults.map((r) => r.score);

  // Step 1: Distribution alignment
  const alignedVectorScores = alignScoreDistribution(vectorScores, config.targetDistribution);
  const alignedFulltextScores = alignScoreDistribution(fulltextScores, config.targetDistribution);

  // Step 2: Min-max normalization to 0-1 range
  const normalizedVectorScores = normalizeToUnitRange(alignedVectorScores);
  const normalizedFulltextScores = normalizeToUnitRange(alignedFulltextScores);

  // Step 3: Compute weights with coverage penalty
  const { vectorWeight, fulltextWeight } = computeCoverageAdjustedWeights(
    vectorResults.length,
    fulltextResults.length,
    config
  );

  // Step 4: Build score and document maps (apply quality threshold to fulltext)
  const vectorScoreMap = new Map<string, number>();
  const fulltextScoreMap = new Map<string, number>();
  const vectorDocMap = new Map<string, T>();
  const fulltextDocMap = new Map<string, T>();

  for (let i = 0; i < vectorResults.length; i++) {
    const result = vectorResults[i];
    const normalizedScore = normalizedVectorScores[i];
    if (result && normalizedScore !== undefined) {
      vectorScoreMap.set(result.result.id, normalizedScore);
      vectorDocMap.set(result.result.id, result.result);
    }
  }

  for (let i = 0; i < fulltextResults.length; i++) {
    const result = fulltextResults[i];
    const normalizedScore = normalizedFulltextScores[i];
    if (result && normalizedScore !== undefined) {
      // Apply quality threshold if configured
      if (!config.qualityThreshold || normalizedScore >= config.qualityThreshold) {
        fulltextScoreMap.set(result.result.id, normalizedScore);
        fulltextDocMap.set(result.result.id, result.result);
      }
    }
  }

  // Step 5: Combine results using weighted average
  const fusedResults = new Map<string, RankedResult<T>>();
  const allIds = new Set([...vectorScoreMap.keys(), ...fulltextScoreMap.keys()]);

  for (const id of allIds) {
    const vScore = vectorScoreMap.get(id);
    const fScore = fulltextScoreMap.get(id);

    // Lookup result object from maps - O(1)
    const resultItem = vectorDocMap.get(id) ?? fulltextDocMap.get(id);

    if (!resultItem) continue;

    let finalScore: number;
    let source: RetrievalMethod;

    if (vScore !== undefined && fScore !== undefined) {
      // Both sources found this - weighted average
      finalScore = vectorWeight * vScore + fulltextWeight * fScore;
      source = 'multiple';
    } else if (vScore !== undefined) {
      // Only vector found it
      finalScore = vScore * vectorWeight;
      source = vectorSource;
    } else {
      // Only fulltext found it
      finalScore = (fScore ?? 0) * fulltextWeight;
      source = fulltextSource;
    }

    fusedResults.set(id, {
      result: resultItem,
      score: finalScore,
      source
    });
  }

  // Sort by score descending
  return Array.from(fusedResults.values()).sort((a, b) => b.score - a.score);
}
