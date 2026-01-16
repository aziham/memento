/**
 * Search Entities Phase
 *
 * Second phase of the consolidation pipeline.
 * Batch embeds entities and searches for existing matches.
 *
 * Input: Extracted entities
 * Output: Search results with embeddings for reuse
 */

import type { EmbeddingClient } from '@/providers/embedding/types';
import type { Entity, GraphClient } from '@/providers/graph/types';
import type { ExtractedEntity } from '../schemas';
import type { EntitySearchResult, EntitySearchWithEmbedding, EntityToSearch } from '../types';
import { assertDefined } from '../utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_SEARCH_RESULTS = 5;

// ═══════════════════════════════════════════════════════════════════════════════
// Phase Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search for existing entities matching the extracted entities.
 *
 * 1. Batch embed all "Name: Description" strings
 * 2. Run hybrid search for each entity
 * 3. Return results with embeddings for reuse in write phase
 *
 * @param entities - Extracted entities to search for
 * @param graphClient - Graph client for search
 * @param embeddingClient - Embedding client for batch embedding
 * @returns Search results with query embeddings
 */
export async function searchEntities(
  entities: ExtractedEntity[],
  graphClient: GraphClient,
  embeddingClient: EmbeddingClient
): Promise<EntitySearchWithEmbedding[]> {
  if (entities.length === 0) return [];

  // Build search inputs
  const entitiesToSearch: EntityToSearch[] = entities.map((e) => ({
    name: e.name,
    description: e.description
  }));

  // Batch embed all "Name: Description" strings in one API call
  const entitySearchTexts = entitiesToSearch.map((e) => `${e.name}: ${e.description}`);
  const vectors = await embeddingClient.embedBatch(entitySearchTexts);

  // Run searches in parallel
  const searchResults = await Promise.all(
    entitiesToSearch.map(async (entity, i) => {
      const vector = assertDefined(vectors[i], `Missing embedding for entity ${i}`);

      // Search by name for fulltext, but use "Name: Description" embedding for vector
      const results = await graphClient.searchHybrid(
        'Entity',
        entity.name,
        vector,
        MAX_SEARCH_RESULTS
      );

      const entityResults: EntitySearchResult[] = results.map((r) => {
        const e = r.node as Entity;
        return {
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description,
          similarity: r.score
        };
      });

      return {
        queryEmbedding: vector,
        results: entityResults
      };
    })
  );

  return searchResults;
}
