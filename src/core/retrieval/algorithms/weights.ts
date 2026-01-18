/**
 * Entity Weighting Algorithms
 *
 * Multi-signal weighting for anchor entities in the ANCHOR phase.
 * Combines semantic, memory-based, and structural signals.
 */

import type { RetrievalConfig } from '../config';
import type { EntityWithDetails, ScoredMemory } from '../types';
import { computeCosineSimilarity } from './similarity';

/**
 * Compute multi-signal weights for anchor entities.
 *
 * Combines three signals for robust entity weighting:
 * 1. **Semantic**: Direct similarity between entity embedding and query embedding
 * 2. **Memory-based**: Average similarity of memories about this entity to the query
 * 3. **Structural**: Graph centrality (degree) - entities connected to more memories are more important
 *
 * @param entities - Entities with embeddings and degree information
 * @param seedMemories - Seed memories from LAND phase (with aboutEntityNames populated)
 * @param queryEmbedding - Query vector for similarity computation
 * @param config - Retrieval config with anchor.weights settings
 * @returns Map of entity name → weight
 *
 * @example
 * const weights = computeMultiSignalEntityWeights(
 *   [{ name: 'Bun', embedding: [...], degree: 10 }],
 *   seedMemories,
 *   queryEmbedding,
 *   config
 * );
 * // weights.get('Bun') → 0.72
 */
export function computeMultiSignalEntityWeights(
  entities: EntityWithDetails[],
  seedMemories: ScoredMemory[],
  queryEmbedding: number[],
  config: RetrievalConfig
): Map<string, number> {
  const weights = new Map<string, number>();

  // Build entity → memories map for memory-based signal
  const entityMemories = new Map<string, ScoredMemory[]>();
  for (const scoredMemory of seedMemories) {
    for (const entityName of scoredMemory.aboutEntityNames ?? []) {
      const existing = entityMemories.get(entityName);
      if (existing) {
        existing.push(scoredMemory);
      } else {
        entityMemories.set(entityName, [scoredMemory]);
      }
    }
  }

  // Compute max degree dynamically from the entity set for normalization
  const maxDegree = Math.max(...entities.map((entity) => entity.degree || 1), 1);
  const maxLogDegree = Math.log(1 + maxDegree);

  for (const entity of entities) {
    // Signal 1: Semantic similarity (entity embedding vs query)
    // Entity embedding is "Name: Description" - already rich with context!
    const semanticSimilarity =
      entity.embedding && entity.embedding.length > 0
        ? computeCosineSimilarity(entity.embedding, queryEmbedding)
        : 0;

    // Signal 2: Memory-based similarity
    // Average similarity of memories about this entity to the query
    const memories = entityMemories.get(entity.name) ?? [];
    let memoryBasedSimilarity = 0;
    if (memories.length > 0) {
      let sum = 0;
      for (const scoredMemory of memories) {
        if (scoredMemory.result.embedding && scoredMemory.result.embedding.length > 0) {
          sum += computeCosineSimilarity(scoredMemory.result.embedding, queryEmbedding);
        }
      }
      memoryBasedSimilarity = sum / memories.length;
    }

    // Signal 3: Structural importance (degree centrality)
    // log(1 + degree) to dampen the effect of very high-degree entities
    // Normalized relative to max degree in the current entity set
    const structuralImportance = Math.log(1 + (entity.degree || 1));
    const normalizedStructural = maxLogDegree > 0 ? structuralImportance / maxLogDegree : 0;

    // Combine signals with configurable weights
    const finalWeight =
      config.anchor.weights.semantic * semanticSimilarity +
      config.anchor.weights.memory * memoryBasedSimilarity +
      config.anchor.weights.structural * normalizedStructural;

    weights.set(entity.name, finalWeight);
  }

  return weights;
}

/**
 * Normalize entity weights to sum to 1.
 *
 * Used to create a proper personalization vector for PPR.
 *
 * @param weights - Map of entity name → weight
 * @returns Map of entity name → normalized weight (sums to 1)
 */
export function normalizeEntityWeights(weights: Map<string, number>): Map<string, number> {
  const total = Array.from(weights.values()).reduce((a, b) => a + b, 0);

  // Handle zero or negative totals (can occur if all similarities are negative/zero)
  // Return empty map so callers know normalization failed rather than receiving unnormalized weights
  if (total <= 0) return new Map();

  const normalized = new Map<string, number>();
  for (const [name, weight] of weights) {
    normalized.set(name, weight / total);
  }

  return normalized;
}
