/**
 * DISTILL Phase - Fuse signals and select diverse results
 *
 * Fourth phase of the retrieval pipeline. Combines results from LAND and EXPAND
 * using weighted fusion, then applies MMR for diversity.
 */

import { fuseSearchResults } from '../algorithms';
import { computeAdaptiveLambda, mmrRerank } from '../algorithms/mmr';
import type { RetrievalConfig } from '../config';
import type { ScoredMemory } from '../types';

/**
 * Execute the DISTILL phase.
 *
 * 1. Fuse LAND and EXPAND results using weighted averaging
 * 2. Compute adaptive MMR lambda based on score distribution
 * 3. Apply MMR reranking for diversity
 *
 * @param landResults - Results from LAND phase (vector + fulltext)
 * @param expandResults - Results from EXPAND phase (SEM-PPR)
 * @param config - Retrieval configuration
 * @returns Top K diverse memories
 */
export function distill(
  landResults: ScoredMemory[],
  expandResults: ScoredMemory[],
  config: RetrievalConfig
): ScoredMemory[] {
  // Determine expand source from results (defaults to 'sem-ppr')
  const expandSource = expandResults[0]?.source ?? 'sem-ppr';

  // Fuse LAND and EXPAND results
  // LAND results are from vector+fulltext (already marked 'multiple')
  // EXPAND results are from SEM-PPR (or plain PPR if configured)
  const fused = fuseSearchResults(landResults, expandResults, 'multiple', expandSource, {
    vectorWeight: config.fusion.vectorWeight,
    fulltextWeight: 1 - config.fusion.vectorWeight,
    minResultsForFullWeight: 5,
    qualityThreshold: 0.3,
    targetDistribution: { mean: 0.5, standardDeviation: 0.2 }
  });

  // Compute adaptive lambda based on score distribution
  // Large gap = clear winner = favor relevance (high λ)
  // Small gap = many similar = favor diversity (low λ)
  const lambda = computeAdaptiveLambda(fused, config);

  // Apply MMR for diversity with adaptive lambda
  return mmrRerank(fused, lambda, config.distill.topK);
}
