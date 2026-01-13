/**
 * Neo4j Search Operations
 *
 * Vector search, fulltext search, and graph traversal.
 * Uses runCommand for session lifecycle and query repository for Cypher.
 */

import neo4j, { type Driver } from 'neo4j-driver';
import type {
  Entity,
  EntityData,
  InvalidatedMemoryData,
  Memory,
  ProvenanceData,
  SearchResult
} from '../../types';
import { rrfFusion, sanitizeLucene } from '../../utils';
import { INDEXES } from '../constants';
import { runCommand } from '../errors';
import { recordToEntity, recordToMemory } from '../mapping';
import {
  createNeighborhoodQuery,
  FULLTEXT_SEARCH,
  FULLTEXT_SEARCH_FILTERED,
  GET_ENTITIES_BY_NAME,
  GET_MEMORY_ABOUT_ENTITIES,
  GET_MEMORY_HISTORY,
  GET_MEMORY_INVALIDATES_CHAIN,
  GET_MEMORY_PROVENANCE,
  VECTOR_SEARCH,
  VECTOR_SEARCH_FILTERED
} from '../queries';

// ============================================================
// SEARCH OPTIONS
// ============================================================

/**
 * Options for search operations.
 */
export interface SearchOptions {
  /**
   * Filter to only return valid memories (invalid_at IS NULL).
   * Only applicable when searching Memory nodes.
   * @default false
   */
  validOnly?: boolean;
}

// ============================================================
// VECTOR SEARCH
// ============================================================

/**
 * Search for similar nodes using vector embeddings.
 *
 * Uses cosine similarity via Neo4j's vector index.
 * Returns nodes ordered by similarity score (highest first).
 *
 * @param driver - Neo4j driver
 * @param database - Database name
 * @param label - Node label to search ('Memory' or 'Entity')
 * @param vector - Query vector (must be L2 normalized)
 * @param limit - Maximum number of results
 * @param options - Optional search options (e.g., validOnly for Memory)
 */
export async function searchVector(
  driver: Driver,
  database: string,
  label: 'Memory' | 'Entity',
  vector: number[],
  limit: number,
  options?: SearchOptions
): Promise<SearchResult<Memory | Entity>[]> {
  const indexName = label === 'Memory' ? INDEXES.MEMORY_VECTOR : INDEXES.ENTITY_VECTOR;
  const useFilter = label === 'Memory' && options?.validOnly === true;
  const query = useFilter ? VECTOR_SEARCH_FILTERED : VECTOR_SEARCH;

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(query, {
        indexName,
        limit: neo4j.int(limit),
        vector
      });

      return result.records.map((r) => ({
        node: label === 'Memory' ? recordToMemory(r.get('node')) : recordToEntity(r.get('node')),
        score: r.get('score')
      }));
    },
    'searchVector'
  );
}

// ============================================================
// FULLTEXT SEARCH
// ============================================================

/**
 * Search for nodes using fulltext (keyword) search.
 *
 * Uses Lucene-based fulltext index for keyword matching.
 * Complements vector search for hybrid retrieval.
 *
 * @param driver - Neo4j driver
 * @param database - Database name
 * @param label - Node label to search ('Memory' or 'Entity')
 * @param query - Search query (will be sanitized for Lucene)
 * @param limit - Maximum number of results
 * @param options - Optional search options (e.g., validOnly for Memory)
 */
export async function searchFulltext(
  driver: Driver,
  database: string,
  label: 'Memory' | 'Entity',
  query: string,
  limit: number,
  options?: SearchOptions
): Promise<SearchResult<Memory | Entity>[]> {
  const sanitizedQuery = sanitizeLucene(query);
  const indexName = label === 'Memory' ? INDEXES.MEMORY_FULLTEXT : INDEXES.ENTITY_FULLTEXT;
  const useFilter = label === 'Memory' && options?.validOnly === true;
  const cypher = useFilter ? FULLTEXT_SEARCH_FILTERED : FULLTEXT_SEARCH;

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(cypher, {
        indexName,
        query: sanitizedQuery,
        limit: neo4j.int(limit)
      });

      return result.records.map((r) => ({
        node: label === 'Memory' ? recordToMemory(r.get('node')) : recordToEntity(r.get('node')),
        score: r.get('score')
      }));
    },
    'searchFulltext'
  );
}

// ============================================================
// HYBRID SEARCH
// ============================================================

/**
 * Hybrid search combining vector and fulltext results.
 *
 * Strategy:
 * 1. Run vector search and fulltext search in parallel
 * 2. Fetch 2x limit from each for better fusion coverage
 * 3. Combine results using RRF
 * 4. Return top `limit` results
 *
 * @param driver - Neo4j driver
 * @param database - Database name
 * @param label - Node label to search ('Memory' or 'Entity')
 * @param query - Text query for fulltext search
 * @param vector - Query vector for similarity search
 * @param limit - Maximum number of results to return
 * @param options - Optional search options (e.g., validOnly for Memory)
 */
export async function searchHybrid(
  driver: Driver,
  database: string,
  label: 'Memory' | 'Entity',
  query: string,
  vector: number[],
  limit: number,
  options?: SearchOptions
): Promise<SearchResult<Memory | Entity>[]> {
  // Run both searches in parallel, fetch 2x for better fusion
  const [vectorResults, fulltextResults] = await Promise.all([
    searchVector(driver, database, label, vector, limit * 2, options),
    searchFulltext(driver, database, label, query, limit * 2, options)
  ]);

  // Convert to format for RRF (need id field)
  const vectorList = vectorResults.map((r) => ({
    id: r.node.id,
    node: r.node,
    score: r.score
  }));
  const fulltextList = fulltextResults.map((r) => ({
    id: r.node.id,
    node: r.node,
    score: r.score
  }));

  // Combine with RRF
  const fused = rrfFusion([vectorList, fulltextList]);

  // Return top `limit` results with RRF score
  return fused.slice(0, limit).map((r) => ({
    node: r.item.node,
    score: r.score
  }));
}

// ============================================================
// GRAPH TRAVERSAL
// ============================================================

/**
 * Get memories reachable from anchor entities via graph traversal.
 *
 * Traversal goes through ABOUT edges:
 *   Entity/User -[ABOUT]- Memory -[ABOUT]- Entity -[ABOUT]- Memory
 *
 * One semantic hop = Entity → Memory → Entity (find entities that share memories)
 *
 * Why undirected traversal?
 * Human memory is associative - a Project reminds you of its Owner
 * just as much as an Owner reminds you of their Projects.
 * Graph distance represents "contextual closeness", not hierarchy.
 */
export async function getNeighborhood(
  driver: Driver,
  database: string,
  anchorIds: string[]
): Promise<Memory[]> {
  if (anchorIds.length === 0) return [];

  const query = createNeighborhoodQuery();

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(query, { anchorIds });
      return result.records.map((r) => recordToMemory(r.get('m')));
    },
    'getNeighborhood'
  );
}

// ============================================================
// MEMORY ABOUT ENTITIES
// ============================================================

/**
 * Get the entity names that memories are about.
 *
 * Given a list of memory IDs, returns a map of memoryId -> entityNames[].
 * Handles both Entity and User nodes (both have `name` field).
 */
export async function getMemoryAboutEntities(
  driver: Driver,
  database: string,
  memoryIds: string[]
): Promise<Map<string, string[]>> {
  if (memoryIds.length === 0) return new Map();

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GET_MEMORY_ABOUT_ENTITIES, { memoryIds });
      const map = new Map<string, string[]>();
      for (const record of result.records) {
        const memoryId = record.get('memoryId') as string;
        const entityNames = record.get('entityNames') as string[];
        map.set(memoryId, entityNames);
      }
      return map;
    },
    'getMemoryAboutEntities'
  );
}

// ============================================================
// MEMORY HISTORY
// ============================================================

/**
 * History entry for a superseded memory.
 */
export interface MemoryHistoryEntry {
  /** Memory ID */
  id: string;
  /** Memory content */
  content: string;
  /** Depth in the invalidation chain (1=direct, 2=predecessor's predecessor) */
  depth: number;
  /** When this memory was invalidated (ISO 8601) */
  supersededAt: string | null;
}

/**
 * Get the invalidation history chain for memories.
 *
 * For each memory, follows the INVALIDATES chain to find superseded memories.
 * Returns up to 2 levels of history (direct predecessor and its predecessor).
 *
 * @param driver - Neo4j driver
 * @param database - Database name
 * @param memoryIds - Memory IDs to get history for
 * @returns Map of memoryId -> history entries
 */
export async function getMemoryHistory(
  driver: Driver,
  database: string,
  memoryIds: string[]
): Promise<Map<string, MemoryHistoryEntry[]>> {
  if (memoryIds.length === 0) return new Map();

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GET_MEMORY_HISTORY, { memoryIds });
      const map = new Map<string, MemoryHistoryEntry[]>();

      for (const record of result.records) {
        const memoryId = record.get('memoryId') as string;
        const history = record.get('history') as Array<{
          id: string;
          content: string;
          depth: { toNumber(): number };
          supersededAt: string | null;
        }>;

        map.set(
          memoryId,
          history.map((h) => ({
            id: h.id,
            content: h.content,
            depth: typeof h.depth === 'object' ? h.depth.toNumber() : h.depth,
            supersededAt: h.supersededAt
          }))
        );
      }

      return map;
    },
    'getMemoryHistory'
  );
}

// ============================================================
// ENTITY OPERATIONS (for Semantic Expansion)
// ============================================================

/**
 * Entity with embedding for semantic expansion.
 */
export interface EntityWithEmbedding {
  name: string;
  description: string | null;
  embedding: number[] | null;
}

/**
 * Get entities with their embeddings by name.
 *
 * Used by semantic expansion to check entity similarity to query.
 *
 * @param driver - Neo4j driver
 * @param database - Database name
 * @param entityNames - Entity names to fetch
 * @returns Entities with embeddings
 */
export async function getEntitiesWithEmbeddings(
  driver: Driver,
  database: string,
  entityNames: string[]
): Promise<EntityWithEmbedding[]> {
  if (entityNames.length === 0) return [];

  const query = `
    MATCH (e:Entity)
    WHERE e.name IN $entityNames
    RETURN e.name AS name, e.description AS description, e.embedding AS embedding
  `;

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(query, { entityNames });
      return result.records.map((r) => ({
        name: r.get('name') as string,
        description: r.get('description') as string | null,
        embedding: r.get('embedding') as number[] | null
      }));
    },
    'getEntitiesWithEmbeddings'
  );
}

/**
 * Memory with embedding for semantic expansion.
 * Note: embedding can be null if the memory was created without an embedding.
 */
export interface MemoryWithEmbedding {
  id: string;
  content: string;
  embedding: number[] | null;
  created_at: string;
  invalid_at: string | null;
}

/**
 * Get memories about a specific entity.
 *
 * Used by semantic expansion to find memories connected to relevant entities.
 *
 * @param driver - Neo4j driver
 * @param database - Database name
 * @param entityName - Entity name to find memories about
 * @returns Memories with embeddings
 */
export async function getMemoriesAboutEntity(
  driver: Driver,
  database: string,
  entityName: string
): Promise<MemoryWithEmbedding[]> {
  const query = `
    MATCH (m:Memory)-[:ABOUT]->(e:Entity {name: $entityName})
    WHERE m.invalid_at IS NULL
    RETURN m.id AS id, 
           m.content AS content, 
           m.embedding AS embedding,
           m.created_at AS created_at,
           m.invalid_at AS invalid_at
  `;

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(query, { entityName });
      return result.records.map((r) => ({
        id: r.get('id') as string,
        content: r.get('content') as string,
        embedding: (r.get('embedding') as number[] | null) ?? null,
        created_at: r.get('created_at') as string,
        invalid_at: r.get('invalid_at') as string | null
      }));
    },
    'getMemoriesAboutEntity'
  );
}

// ============================================================
// RELATED ENTITIES (for Cross-Reference Expansion)
// ============================================================

/**
 * Related entity with shared memory count.
 */
export interface RelatedEntity {
  name: string;
  sharedMemories: number;
}

/**
 * Get entities related to a given entity via shared memories.
 *
 * Two entities are related if they appear in the same memory.
 * The more memories they share, the stronger the relationship.
 *
 * @param driver - Neo4j driver
 * @param database - Database name
 * @param entityName - Entity to find related entities for
 * @param limit - Maximum number of related entities to return
 * @returns Related entities sorted by shared memory count
 */
export async function getRelatedEntities(
  driver: Driver,
  database: string,
  entityName: string,
  limit: number = 10
): Promise<RelatedEntity[]> {
  const query = `
    MATCH (e1:Entity {name: $entityName})<-[:ABOUT]-(m:Memory)-[:ABOUT]->(e2:Entity)
    WHERE e1 <> e2 AND m.invalid_at IS NULL
    RETURN e2.name AS name, count(m) AS sharedMemories
    ORDER BY sharedMemories DESC
    LIMIT $limit
  `;

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(query, { entityName, limit: neo4j.int(limit) });
      return result.records.map((r) => ({
        name: r.get('name') as string,
        sharedMemories: (r.get('sharedMemories') as { toNumber(): number }).toNumber()
      }));
    },
    'getRelatedEntities'
  );
}

// ============================================================
// RICH OUTPUT OPERATIONS (Phase 2)
// ============================================================

/**
 * Get the invalidation chain for memories (2 hops deep).
 *
 * For each memory, fetches what it directly invalidates (hop 1) and what
 * those invalidated memories also invalidated (hop 2). Includes the reason
 * from the INVALIDATES edge.
 *
 * @param driver - Neo4j driver
 * @param database - Database name
 * @param memoryIds - Memory IDs to get invalidation chain for
 * @returns Map of memoryId -> invalidated memories with reasons
 */
export async function getMemoryInvalidates(
  driver: Driver,
  database: string,
  memoryIds: string[]
): Promise<Map<string, InvalidatedMemoryData[]>> {
  if (memoryIds.length === 0) return new Map();

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GET_MEMORY_INVALIDATES_CHAIN, { memoryIds });
      const map = new Map<string, InvalidatedMemoryData[]>();

      for (const record of result.records) {
        const memoryId = record.get('memoryId') as string;
        const invalidates = record.get('invalidates') as Array<{
          id: string;
          content: string;
          validAt: string | null;
          invalidatedAt: string | null;
          reason: string | null;
          invalidated: Array<{
            id: string;
            content: string;
            validAt: string | null;
            invalidatedAt: string | null;
            reason: string | null;
          }>;
        }>;

        map.set(
          memoryId,
          invalidates.map((inv) => ({
            id: inv.id,
            content: inv.content,
            validAt: inv.validAt ?? null,
            invalidatedAt: inv.invalidatedAt ?? null,
            reason: inv.reason ?? null,
            invalidated:
              inv.invalidated.length > 0
                ? inv.invalidated.map((hop2) => ({
                    id: hop2.id,
                    content: hop2.content,
                    validAt: hop2.validAt ?? null,
                    invalidatedAt: hop2.invalidatedAt ?? null,
                    reason: hop2.reason ?? null
                  }))
                : undefined
          }))
        );
      }

      return map;
    },
    'getMemoryInvalidates'
  );
}

/**
 * Get the provenance (source Note) for memories.
 *
 * For each memory, fetches the Note it was extracted from.
 * Provides context about the original user input that generated the memory.
 *
 * @param driver - Neo4j driver
 * @param database - Database name
 * @param memoryIds - Memory IDs to get provenance for
 * @returns Map of memoryId -> provenance data
 */
export async function getMemoryProvenance(
  driver: Driver,
  database: string,
  memoryIds: string[]
): Promise<Map<string, ProvenanceData>> {
  if (memoryIds.length === 0) return new Map();

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GET_MEMORY_PROVENANCE, { memoryIds });
      const map = new Map<string, ProvenanceData>();

      for (const record of result.records) {
        const memoryId = record.get('memoryId') as string;
        map.set(memoryId, {
          noteId: record.get('noteId') as string,
          noteContent: record.get('noteContent') as string,
          noteTimestamp: record.get('noteTimestamp') as string
        });
      }

      return map;
    },
    'getMemoryProvenance'
  );
}

/**
 * Get full entity details by name.
 *
 * Fetches full entity details by name, handling both Entity and User nodes.
 * Used to build rich entity context for retrieval output.
 *
 * @param driver - Neo4j driver
 * @param database - Database name
 * @param names - Entity names to fetch
 * @returns Map of name -> entity data
 */
export async function getEntitiesByName(
  driver: Driver,
  database: string,
  names: string[]
): Promise<Map<string, EntityData>> {
  if (names.length === 0) return new Map();

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GET_ENTITIES_BY_NAME, { names });
      const map = new Map<string, EntityData>();

      for (const record of result.records) {
        const name = record.get('name') as string;
        const id = record.get('id') as string | null;

        // Skip if entity not found (id is null)
        if (!id) continue;

        const isUser = record.get('isUser') as boolean;

        map.set(name, {
          id,
          name: record.get('entityName') as string,
          type: record.get('type') as string,
          description: record.get('description') as string | null,
          isWellKnown: isUser ? false : (record.get('isWellKnown') as boolean), // User is never well-known
          isUser
        });
      }

      return map;
    },
    'getEntitiesByName'
  );
}
