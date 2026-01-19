/**
 * LAND Phase - Cast wide net with vector + fulltext search
 *
 * First phase of the retrieval pipeline. Searches for seed memories
 * using both vector similarity and fulltext (BM25) search, then
 * fuses results using weighted averaging.
 */

import type { GraphClient, Memory } from '@/providers/graph/types';
import { fuseSearchResults } from '../algorithms';
import type { RetrievalConfig } from '../config';
import type { ScoredMemory } from '../types';

/**
 * Execute the LAND phase.
 *
 * 1. Run vector search and fulltext search in parallel (filtering invalid memories)
 * 2. Fuse results using weighted averaging (70% vector, 30% fulltext)
 *
 * @param graphClient - Graph client for database operations
 * @param query - Text query for fulltext search
 * @param queryEmbedding - Query embedding for vector search
 * @param config - Retrieval configuration
 * @returns Fused seed memories sorted by score descending
 */
export async function land(
  graphClient: GraphClient,
  query: string,
  queryEmbedding: number[],
  config: RetrievalConfig
): Promise<ScoredMemory[]> {
  // Run both searches in parallel, filtering out invalid memories at query level
  const [vectorResults, fulltextResults] = await Promise.all([
    graphClient.searchVector('Memory', queryEmbedding, config.land.candidates, {
      validOnly: true
    }),
    graphClient.searchFulltext('Memory', query, config.land.candidates, { validOnly: true })
  ]);

  // Convert to ScoredMemory format
  const vectorScored: ScoredMemory[] = vectorResults.map((r) => ({
    result: r.node as Memory,
    score: r.score,
    source: 'vector' as const
  }));

  const fulltextScored: ScoredMemory[] = fulltextResults.map((r) => ({
    result: r.node as Memory,
    score: r.score,
    source: 'fulltext' as const
  }));

  // Fuse using weighted averaging
  return fuseSearchResults(vectorScored, fulltextScored, 'vector', 'fulltext', {
    vectorWeight: config.fusion.vectorWeight,
    fulltextWeight: 1 - config.fusion.vectorWeight,
    minResultsForFullWeight: 5,
    qualityThreshold: 0.3,
    targetDistribution: { mean: 0.5, standardDeviation: 0.2 }
  });
}
