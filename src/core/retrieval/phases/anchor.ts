/**
 * ANCHOR Phase - Find anchor entities from seed memories
 *
 * Second phase of the retrieval pipeline. Identifies entities that appear
 * frequently in seed memories and computes multi-signal weights for PPR.
 */

import type { GraphClient } from '@/providers/graph/types';
import { computeMultiSignalEntityWeights, normalizeEntityWeights } from '../algorithms/weights';
import type { RetrievalConfig } from '../config';
import type { EntityWithDetails, ScoredMemory, WeightedEntity } from '../types';

/**
 * Execute the ANCHOR phase.
 *
 * 1. Get entities from seed memories
 * 2. Filter to entities appearing in minMemories+ memories (anchor threshold)
 * 3. Fetch entity details (embedding, degree)
 * 4. Compute multi-signal weights (semantic + memory + structural)
 * 5. Normalize weights for PPR personalization
 *
 * @param graphClient - Graph client for database operations
 * @param seedMemories - Seed memories from LAND phase
 * @param queryEmbedding - Query vector for similarity computation
 * @param config - Retrieval configuration
 * @returns Weighted anchor entities for PPR personalization
 */
export async function anchor(
  graphClient: GraphClient,
  seedMemories: ScoredMemory[],
  queryEmbedding: number[],
  config: RetrievalConfig
): Promise<WeightedEntity[]> {
  if (seedMemories.length === 0) return [];

  // Get entities from seed memories
  const memoryIds = seedMemories.map((m) => m.result.id);
  const entityMap = await graphClient.getMemoryAboutEntities(memoryIds);

  // Populate aboutEntityNames on seed memories for weight computation
  const memoriesWithEntities: ScoredMemory[] = seedMemories.map((m) => ({
    ...m,
    aboutEntityNames: entityMap.get(m.result.id) ?? []
  }));

  // Count entity frequency across memories
  const entityFrequency = new Map<string, number>();
  for (const [, entityNames] of entityMap) {
    for (const name of entityNames) {
      entityFrequency.set(name, (entityFrequency.get(name) ?? 0) + 1);
    }
  }

  // Filter to entities appearing in minMemories+ memories (anchor threshold)
  const frequentEntityNames = Array.from(entityFrequency.entries())
    .filter(([, count]) => count >= config.anchor.minMemories)
    .map(([name]) => name);

  if (frequentEntityNames.length === 0) return [];

  // Fetch entity details with degree (bulk operation)
  const entitiesWithDegree = await graphClient.getEntitiesWithDegree(frequentEntityNames);

  // Convert to EntityWithDetails format for weight computation
  const entityDetails: EntityWithDetails[] = entitiesWithDegree.map((e) => ({
    name: e.entity.name,
    embedding: e.entity.embedding,
    degree: e.degree
  }));

  // Compute multi-signal weights (semantic + memory + structural)
  const weights = computeMultiSignalEntityWeights(
    entityDetails,
    memoriesWithEntities,
    queryEmbedding,
    config
  );

  // Normalize weights to sum to 1 for PPR personalization
  const normalizedWeights = normalizeEntityWeights(weights);

  // Build weighted entities
  return entitiesWithDegree
    .map((e) => ({
      entity: e.entity,
      weight: normalizedWeights.get(e.entity.name) ?? 0
    }))
    .filter((e) => e.weight > 0);
}
