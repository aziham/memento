/**
 * EXPAND Phase - Walk graph outward from anchors via SEM-PPR
 *
 * Third phase of the retrieval pipeline. Uses Semantic-Enhanced Personalized
 * PageRank (SEM-PPR) to find memories connected to anchor entities through
 * the graph, combining structural and semantic signals.
 *
 * SEM-PPR improves on plain PPR by:
 * - Using PPR for structural graph traversal (finding connected memories)
 * - Boosting results with semantic similarity (ensuring relevance)
 * - Combining both signals with configurable weights
 */

import type { GraphClient, Memory } from '@/providers/graph/types';
import { applySemanticPPRBoost } from '../algorithms';
import type { RetrievalConfig } from '../config';
import type { EmbeddedRankedResult, ScoredMemory, WeightedEntity } from '../types';

/**
 * Execute the EXPAND phase using SEM-PPR.
 *
 * 1. Run Personalized PageRank to find structurally connected memories
 * 2. Apply semantic boosting to combine structure with relevance
 *
 * @param graphClient - Graph client for database operations
 * @param anchorEntities - Weighted anchor entities from ANCHOR phase
 * @param queryEmbedding - Query vector for semantic similarity
 * @param config - Retrieval configuration
 * @returns Memories with SEM-PPR scores, sorted by score descending
 */
export async function expand(
  graphClient: GraphClient,
  anchorEntities: WeightedEntity[],
  queryEmbedding: number[],
  config: RetrievalConfig
): Promise<ScoredMemory[]> {
  if (anchorEntities.length === 0) return [];

  // Extract entity IDs for PPR source nodes
  const sourceNodeIds = anchorEntities.map((e) => e.entity.id);

  // Run PPR with configured damping and iterations
  // Note: GDS doesn't support weighted source nodes directly in the stream API,
  // so we use equal weights for now. The anchor weights are already factored
  // into entity selection in the ANCHOR phase.
  const pprResults = await graphClient.runPersonalizedPageRank(
    sourceNodeIds,
    config.expand.damping,
    config.expand.iterations,
    config.land.candidates // Use same limit as LAND for fusion
  );

  // Convert to EmbeddedRankedResult format for SEM-PPR
  const embeddedResults: EmbeddedRankedResult<Memory>[] = pprResults.map((r) => ({
    result: r.memory,
    score: r.score,
    embedding: r.memory.embedding ?? undefined
  }));

  // Apply SEM-PPR: combine structural (PPR) with semantic similarity
  const boostedResults = applySemanticPPRBoost(embeddedResults, queryEmbedding, {
    structureWeight: config.expand.structuralWeight
  });

  // Convert to ScoredMemory format
  return boostedResults.map((r) => ({
    result: r.result,
    score: r.score,
    source: 'sem-ppr' as const
  }));
}
