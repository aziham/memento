/**
 * Neo4j Query Repository
 *
 * Centralized Cypher queries with intent documentation.
 * Each query explains the "Why" - the semantic reasoning behind the pattern.
 */

import { INDEXES, LABELS, RELS } from './constants';

// ============================================================
// SCHEMA QUERIES
// ============================================================

/**
 * CONSTRAINT QUERIES
 *
 * Why unique constraints on id AND name for Entity?
 * - id: Internal reference integrity (UUIDs for relationships)
 * - name: Domain uniqueness (no duplicate "John Smith" entities)
 *
 * Memory and Note only need id uniqueness - their content
 * can legitimately repeat (same fact from different sources).
 */
export const CONSTRAINTS = {
  USER_ID: `CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:${LABELS.USER}) REQUIRE u.id IS UNIQUE`,
  ENTITY_ID: `CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (e:${LABELS.ENTITY}) REQUIRE e.id IS UNIQUE`,
  ENTITY_NAME: `CREATE CONSTRAINT entity_name_unique IF NOT EXISTS FOR (e:${LABELS.ENTITY}) REQUIRE e.name IS UNIQUE`,
  MEMORY_ID: `CREATE CONSTRAINT memory_id_unique IF NOT EXISTS FOR (m:${LABELS.MEMORY}) REQUIRE m.id IS UNIQUE`,
  NOTE_ID: `CREATE CONSTRAINT note_id_unique IF NOT EXISTS FOR (n:${LABELS.NOTE}) REQUIRE n.id IS UNIQUE`
} as const;

/**
 * RANGE INDEX QUERIES
 *
 * Why these specific indexes?
 * - valid_at/invalid_at: Temporal queries (what was true at time T?)
 * - timestamp: Note ordering for conversation reconstruction
 */
export const RANGE_INDEXES = {
  MEMORY_VALID_AT: `CREATE INDEX memory_valid_at IF NOT EXISTS FOR (m:${LABELS.MEMORY}) ON (m.valid_at)`,
  MEMORY_INVALID_AT: `CREATE INDEX memory_invalid_at IF NOT EXISTS FOR (m:${LABELS.MEMORY}) ON (m.invalid_at)`,
  NOTE_TIMESTAMP: `CREATE INDEX note_timestamp IF NOT EXISTS FOR (n:${LABELS.NOTE}) ON (n.timestamp)`
} as const;

/**
 * Generate vector index creation query.
 *
 * Why cosine similarity?
 * Embedding models are trained with cosine similarity in mind.
 * The vectors are normalized, making cosine equivalent to dot product
 * but more interpretable (1.0 = identical, 0.0 = orthogonal).
 */
export function createVectorIndexQuery(
  indexName: string,
  label: string,
  dimensions: number
): string {
  return `CREATE VECTOR INDEX ${indexName} IF NOT EXISTS FOR (n:${label}) ON (n.embedding) OPTIONS {indexConfig: {\`vector.dimensions\`: ${dimensions}, \`vector.similarity_function\`: 'cosine'}}`;
}

/**
 * FULLTEXT INDEX QUERIES
 *
 * Why fulltext on content/name/description?
 * Enables keyword search when the user remembers specific terms
 * but semantic search would miss due to paraphrasing.
 * Complements vector search for hybrid retrieval.
 *
 * Entity fulltext index covers both name and description to enable
 * searching by entity definition (e.g., "JavaScript runtime" finds "Bun").
 */
export const FULLTEXT_INDEXES = {
  MEMORY: `CREATE FULLTEXT INDEX ${INDEXES.MEMORY_FULLTEXT} IF NOT EXISTS FOR (m:${LABELS.MEMORY}) ON EACH [m.content]`,
  ENTITY: `CREATE FULLTEXT INDEX ${INDEXES.ENTITY_FULLTEXT} IF NOT EXISTS FOR (e:${LABELS.ENTITY}) ON EACH [e.name, e.description]`
} as const;

/**
 * NODE PROPERTY INDEXES FOR FILTERING
 *
 * These indexes speed up filtering in traversal queries.
 */
export const FILTER_INDEXES = {} as const;

// ============================================================
// NODE QUERIES
// ============================================================

/**
 * ENTITY MERGE QUERY
 *
 * Why MERGE instead of CREATE?
 * Entities are identified by name (domain key). If "John Smith" already
 * exists, we update their attributes rather than creating a duplicate.
 * This maintains graph integrity and enables entity resolution.
 *
 * Note: type is stored as a property, not a Neo4j label, to keep the schema simple
 * and avoid dynamic label management complexity.
 *
 * Description is a factual definition of what the entity IS (not user opinions).
 * Embedding is computed from "Name: Description" for better semantic search.
 *
 * isWellKnown is immutable - first classification wins. ON MATCH does NOT update it.
 * This ensures consistent behavior once an entity is classified.
 */
export const MERGE_ENTITIES = `
  UNWIND $entities AS entity
  MERGE (e:${LABELS.ENTITY} {name: entity.name})
  ON CREATE SET
    e.id = entity.id,
    e.type = entity.type,
    e.description = entity.description,
    e.embedding = entity.embedding,
    e.isWellKnown = entity.isWellKnown,
    e.created_at = entity.created_at,
    e.updated_at = entity.created_at
  ON MATCH SET
    e.type = entity.type,
    e.description = entity.description,
    e.embedding = entity.embedding,
    e.updated_at = entity.updated_at
  RETURN e
`;

/**
 * MEMORY CREATE QUERY
 *
 * Why CREATE instead of MERGE?
 * Memories are facts with temporal validity. The same fact can be
 * extracted multiple times from different notes - each instance
 * is a separate memory with its own provenance and validity window.
 *
 * Note: name is hardcoded to 'Memory' for Neo4j Browser display.
 */
export const CREATE_MEMORIES = `
  UNWIND $memories AS memory
  CREATE (m:${LABELS.MEMORY} {
    id: memory.id,
    name: 'Memory',
    content: memory.content,
    embedding: memory.embedding,
    created_at: memory.created_at,
    valid_at: memory.valid_at,
    invalid_at: memory.invalid_at
  })
  RETURN m
`;

/**
 * NOTE CREATE QUERY
 *
 * Notes are immutable memorize() inputs - raw provenance data.
 * Never merged or updated, only created and linked.
 *
 * Note: name is hardcoded to 'Note' for Neo4j Browser display.
 */
export const CREATE_NOTES = `
  UNWIND $notes AS note
  CREATE (n:${LABELS.NOTE} {
    id: note.id,
    name: 'Note',
    content: note.content,
    timestamp: note.timestamp
  })
  RETURN n
`;

/**
 * NODE LOOKUP QUERIES
 *
 * Simple id-based lookups. These use the unique constraint index
 * for O(1) access regardless of graph size.
 */
export const GET_ENTITY_BY_ID = `MATCH (e:${LABELS.ENTITY} {id: $id}) RETURN e`;
export const GET_ENTITY_BY_NAME = `MATCH (e:${LABELS.ENTITY} {name: $name}) RETURN e`;
export const GET_MEMORY_BY_ID = `MATCH (m:${LABELS.MEMORY} {id: $id}) RETURN m`;
export const GET_NOTE_BY_ID = `MATCH (n:${LABELS.NOTE} {id: $id}) RETURN n`;

/**
 * BULK ENTITY LOOKUP WITH DEGREE
 *
 * Fetches entities by name with their degree (count of ABOUT relationships).
 * Used by ANCHOR phase for multi-signal entity weighting.
 *
 * Why include degree?
 * Structural importance - entities connected to more memories are more central
 * in the knowledge graph and likely more relevant for retrieval.
 */
export const GET_ENTITIES_WITH_DEGREE = `
  UNWIND $names AS name
  MATCH (e:${LABELS.ENTITY} {name: name})
  OPTIONAL MATCH (e)<-[:${RELS.ABOUT}]-(m:${LABELS.MEMORY})
  WITH e, count(m) AS degree
  RETURN e, degree
`;

/**
 * NODE DELETE QUERY
 *
 * Why DETACH DELETE?
 * Removes the node AND all its relationships. Without DETACH,
 * Neo4j would error if the node has any edges (referential integrity).
 */
export const DELETE_NODES = `
  UNWIND $ids AS id
  MATCH (n {id: id})
  DETACH DELETE n
`;

// ============================================================
// STRUCTURAL EDGE QUERIES
// ============================================================

/**
 * STRUCTURAL EDGE CREATION QUERIES
 *
 * These relationships have fixed semantics defined by the schema.
 * Each captures a specific type of knowledge graph connection.
 */

/** Note -> Entity: Named entity recognition result */
export const CREATE_MENTIONS_EDGE = `
  MATCH (n:${LABELS.NOTE} {id: $noteId})
  MATCH (en:${LABELS.ENTITY} {id: $entityId})
  CREATE (n)-[rel:${RELS.MENTIONS} {id: $edgeId, created_at: $timestamp}]->(en)
  RETURN rel
`;

/** Memory -> Note: Provenance link (where did this fact come from?) */
export const CREATE_EXTRACTED_FROM_EDGE = `
  MATCH (m:${LABELS.MEMORY} {id: $memoryId})
  MATCH (n:${LABELS.NOTE} {id: $noteId})
  CREATE (m)-[rel:${RELS.EXTRACTED_FROM} {id: $edgeId, created_at: $timestamp}]->(n)
  RETURN rel
`;

/**
 * Memory -> Memory: Temporal supersession
 *
 * Why track invalidation explicitly?
 * Enables "what did we believe at time T?" queries and
 * maintains audit trail of knowledge evolution.
 */
export const CREATE_INVALIDATES_EDGE = `
  MATCH (newM:${LABELS.MEMORY} {id: $newMemoryId})
  MATCH (oldM:${LABELS.MEMORY} {id: $oldMemoryId})
  CREATE (newM)-[r:${RELS.INVALIDATES} {id: $edgeId, created_at: $timestamp, reason: $reason}]->(oldM)
  RETURN r
`;

/** Memory -> Entity: What is this memory about? */
export const CREATE_ABOUT_EDGE = `
  MATCH (m:${LABELS.MEMORY} {id: $memoryId})
  MATCH (e:${LABELS.ENTITY} {id: $entityId})
  CREATE (m)-[r:${RELS.ABOUT} {id: $edgeId, created_at: $timestamp}]->(e)
  RETURN r
`;

/**
 * GET MEMORY ABOUT ENTITIES
 *
 * Given a list of memory IDs, return the entity names each memory is about.
 * Handles both Entity and User nodes (both have `name` field).
 */
export const GET_MEMORY_ABOUT_ENTITIES = `
  UNWIND $memoryIds AS memoryId
  MATCH (m:${LABELS.MEMORY} {id: memoryId})-[:${RELS.ABOUT}]->(e)
  RETURN memoryId, collect(e.name) AS entityNames
`;

// ============================================================
// SEARCH QUERIES
// ============================================================

/**
 * VECTOR SEARCH QUERY
 *
 * Why vector search?
 * Semantic similarity - finds memories/entities that mean the same thing
 * even if they use different words. "CEO" matches "chief executive".
 *
 * Note: Filtering is done post-query since Neo4j vector index doesn't support
 * pre-filtering. We fetch extra candidates to compensate for filtered results.
 */
export const VECTOR_SEARCH = `
  CALL db.index.vector.queryNodes($indexName, $limit, $vector)
  YIELD node, score
  RETURN node, score
`;

/**
 * VECTOR SEARCH WITH FILTER QUERY
 *
 * Same as VECTOR_SEARCH but with a WHERE clause for filtering.
 * Used for retrieval to exclude invalid memories.
 */
export const VECTOR_SEARCH_FILTERED = `
  CALL db.index.vector.queryNodes($indexName, $limit, $vector)
  YIELD node, score
  WHERE node.invalid_at IS NULL
  RETURN node, score
`;

/**
 * FULLTEXT SEARCH QUERY
 *
 * Why fulltext search?
 * Keyword matching - finds exact terms the user remembers.
 * Complements vector search for hybrid retrieval strategies.
 */
export const FULLTEXT_SEARCH = `
  CALL db.index.fulltext.queryNodes($indexName, $query)
  YIELD node, score
  RETURN node, score
  LIMIT $limit
`;

/**
 * FULLTEXT SEARCH WITH FILTER QUERY
 *
 * Same as FULLTEXT_SEARCH but with a WHERE clause for filtering.
 * Used for retrieval to exclude invalid memories.
 */
export const FULLTEXT_SEARCH_FILTERED = `
  CALL db.index.fulltext.queryNodes($indexName, $query)
  YIELD node, score
  WHERE node.invalid_at IS NULL
  RETURN node, score
  LIMIT $limit
`;

/**
 * NEIGHBORHOOD TRAVERSAL QUERY
 *
 * Traversal goes through ABOUT edges:
 *   Entity/User -[ABOUT]- Memory -[ABOUT]- Entity -[ABOUT]- Memory
 *
 * One semantic hop = Entity → Memory → Entity (find entities that share memories)
 *
 * Why undirected traversal?
 * Human memory is associative, not hierarchical. A Project reminds you
 * of its Owner just as much as an Owner reminds you of their Projects.
 * Graph distance represents "contextual closeness", not direction.
 *
 * This query handles both Entity and User nodes:
 * - For Entity anchors: finds memories about related entities
 * - For User anchor (id='USER'): finds memories directly about the User
 */
export function createNeighborhoodQuery(): string {
  // One semantic hop: finds memories about entities that share memories with the anchor.
  return `
    UNWIND $anchorIds AS anchorId
    CALL {
      WITH anchorId
      // Case 1: User node - get memories directly about the User
      MATCH (u:${LABELS.USER} {id: anchorId})
      MATCH (m:${LABELS.MEMORY})-[:${RELS.ABOUT}]->(u)
      WHERE m.invalid_at IS NULL
      RETURN m
      
      UNION
      
      WITH anchorId
      // Case 2: Entity node - get memories directly about the entity
      MATCH (anchor:${LABELS.ENTITY} {id: anchorId})
      MATCH (m:${LABELS.MEMORY})-[:${RELS.ABOUT}]->(anchor)
      WHERE m.invalid_at IS NULL
      RETURN m
      
      UNION
      
      WITH anchorId
      // Case 3: Entity node - traverse through memories to find related entities
      // Pattern: Entity -[ABOUT]- Memory -[ABOUT]- Entity (1 semantic hop)
      MATCH (anchor:${LABELS.ENTITY} {id: anchorId})
      MATCH (anchor)<-[:${RELS.ABOUT}]-(m1:${LABELS.MEMORY})-[:${RELS.ABOUT}]->(related:${LABELS.ENTITY})
      WHERE anchor <> related AND m1.invalid_at IS NULL
      MATCH (m:${LABELS.MEMORY})-[:${RELS.ABOUT}]->(related)
      WHERE m.invalid_at IS NULL
      RETURN m
    }
    RETURN DISTINCT m
  `;
}

// ============================================================
// USER QUERIES
// ============================================================

/**
 * USER NODE QUERIES
 *
 * The User node is a singleton representing "the person talking to the AI".
 * It has a fixed id of 'USER'. User is a special Entity.
 *
 * Why a singleton?
 * - There's only one user per Memento instance
 * - Fixed id enables simple lookups without search
 */

/** Get the User node by its fixed id */
export const GET_USER = `
  MATCH (u:${LABELS.USER} {id: 'USER'})
  RETURN u
`;

/**
 * Create the User node.
 * Should only be called once during `memento init`.
 * User type is always 'Person'.
 */
export const CREATE_USER = `
  CREATE (u:${LABELS.USER} {
    id: 'USER',
    name: $name,
    type: 'Person',
    description: $description,
    embedding: $embedding,
    created_at: $created_at,
    updated_at: $updated_at
  })
  RETURN u
`;

/**
 * Update the User node.
 * Uses += to merge updates, preserving unspecified fields.
 */
export const UPDATE_USER = `
  MATCH (u:${LABELS.USER} {id: 'USER'})
  SET u += $updates, u.updated_at = $updated_at
  RETURN u
`;

/**
 * Get or create the User node (MERGE semantics).
 * Useful for idempotent initialization.
 * User type is always 'Person'.
 */
export const GET_OR_CREATE_USER = `
  MERGE (u:${LABELS.USER} {id: 'USER'})
  ON CREATE SET
    u.name = $name,
    u.type = 'Person',
    u.description = $description,
    u.embedding = $embedding,
    u.created_at = $created_at,
    u.updated_at = $updated_at
  RETURN u
`;

/**
 * Create ABOUT edge from Memory to User.
 * Links memories about the user (e.g., "I prefer dark mode") to the User node.
 * Uses MERGE to prevent duplicate edges.
 */
export const CREATE_ABOUT_USER_EDGE = `
  MATCH (m:${LABELS.MEMORY} {id: $memoryId})
  MATCH (u:${LABELS.USER} {id: 'USER'})
  MERGE (m)-[r:${RELS.ABOUT}]->(u)
  ON CREATE SET r.id = $edgeId, r.created_at = $created_at
  RETURN r.id as id
`;

// ============================================================
// GDS (Graph Data Science) QUERIES
// ============================================================

/**
 * PROJECT GRAPH FOR PPR
 *
 * Creates an in-memory graph projection for Personalized PageRank.
 * Projects Memory and Entity nodes with ABOUT relationships (undirected).
 *
 * Why undirected?
 * Human memory is associative - a Project reminds you of its Owner
 * just as much as an Owner reminds you of their Projects.
 *
 * Note: Graph name includes timestamp to avoid conflicts with concurrent queries.
 */
export const GDS_PROJECT_GRAPH = `
  CALL gds.graph.project(
    $graphName,
    ['${LABELS.MEMORY}', '${LABELS.ENTITY}', '${LABELS.USER}'],
    {
      ${RELS.ABOUT}: { orientation: 'UNDIRECTED' }
    }
  )
  YIELD graphName, nodeCount, relationshipCount
  RETURN graphName, nodeCount, relationshipCount
`;

/**
 * RUN PERSONALIZED PAGERANK
 *
 * Runs PPR with weighted source nodes (anchor entities).
 * Returns Memory nodes with their PPR scores.
 *
 * Why damping = 0.75?
 * - 0.85 (traditional): Too much exploration for knowledge graphs
 * - 0.50 (HippoRAG): Too conservative, misses 2-3 hop connections
 * - 0.72-0.78: Optimal for knowledge graphs (2026 research)
 */
export const GDS_RUN_PPR = `
  CALL gds.pageRank.stream($graphName, {
    maxIterations: $iterations,
    dampingFactor: $damping,
    sourceNodes: $sourceNodes
  })
  YIELD nodeId, score
  WITH gds.util.asNode(nodeId) AS node, score
  WHERE node:${LABELS.MEMORY} AND node.invalid_at IS NULL
  RETURN node, score
  ORDER BY score DESC
  LIMIT $limit
`;

/**
 * DROP GRAPH PROJECTION
 *
 * Cleans up the in-memory graph projection after PPR.
 * Important for memory management.
 */
export const GDS_DROP_GRAPH = `
  CALL gds.graph.drop($graphName, false)
  YIELD graphName
  RETURN graphName
`;

/**
 * CHECK IF GRAPH EXISTS
 *
 * Checks if a graph projection exists before dropping.
 */
export const GDS_GRAPH_EXISTS = `
  CALL gds.graph.exists($graphName)
  YIELD exists
  RETURN exists
`;

// ============================================================
// HISTORY CHAIN QUERIES
// ============================================================

/**
 * FETCH MEMORY HISTORY CHAIN
 *
 * For each memory, follows the INVALIDATES chain to find superseded memories.
 * Used by TRACE phase to provide context about how knowledge evolved.
 *
 * Uses max depth 5 in query, but caller should filter by config.trace.maxDepth.
 * Cypher doesn't support parameterized relationship depth, so we fetch more
 * and filter in application code.
 */
export const GET_MEMORY_HISTORY = `
  UNWIND $memoryIds AS memoryId
  MATCH (current:${LABELS.MEMORY} {id: memoryId})
  OPTIONAL MATCH path = (current)-[:${RELS.INVALIDATES}*1..5]->(old:${LABELS.MEMORY})
  WITH current, old, length(path) AS depth
  WHERE old IS NOT NULL
  WITH current.id AS memoryId, 
       collect({
         id: old.id,
         content: old.content,
         depth: depth,
         supersededAt: old.invalid_at
       }) AS history
  RETURN memoryId, history
`;

// ============================================================
// RICH OUTPUT QUERIES (Phase 2)
// ============================================================

/**
 * FETCH MEMORY INVALIDATION CHAIN (2 hops)
 *
 * For each memory, fetches what it directly invalidates (hop 1) and what
 * those invalidated memories also invalidated (hop 2). Includes the reason
 * from the INVALIDATES edge.
 *
 * Why 2 hops?
 * Provides enough context for LLMs to understand knowledge evolution
 * without overwhelming with deep history. Shows immediate supersession
 * and one level of prior context.
 */
export const GET_MEMORY_INVALIDATES_CHAIN = `
  UNWIND $memoryIds AS memoryId
  MATCH (current:${LABELS.MEMORY} {id: memoryId})
  OPTIONAL MATCH (current)-[r1:${RELS.INVALIDATES}]->(hop1:${LABELS.MEMORY})
  OPTIONAL MATCH (hop1)-[r2:${RELS.INVALIDATES}]->(hop2:${LABELS.MEMORY})
  WITH current.id AS memoryId,
       hop1, r1,
       collect(CASE WHEN hop2 IS NOT NULL THEN {
         id: hop2.id,
         content: hop2.content,
         validAt: hop2.valid_at,
         invalidatedAt: hop2.invalid_at,
         reason: r2.reason
       } ELSE NULL END) AS hop2List
  WHERE hop1 IS NOT NULL
  WITH memoryId,
       collect({
         id: hop1.id,
         content: hop1.content,
         validAt: hop1.valid_at,
         invalidatedAt: hop1.invalid_at,
         reason: r1.reason,
         invalidated: [x IN hop2List WHERE x IS NOT NULL]
       }) AS invalidates
  RETURN memoryId, invalidates
`;

/**
 * FETCH MEMORY PROVENANCE
 *
 * For each memory, fetches the Note it was extracted from.
 * Provides context about the original user input that generated the memory.
 *
 * Why include provenance?
 * LLMs can use the original note content to understand context,
 * resolve ambiguity, and provide more accurate responses.
 */
export const GET_MEMORY_PROVENANCE = `
  UNWIND $memoryIds AS memoryId
  MATCH (m:${LABELS.MEMORY} {id: memoryId})-[:${RELS.EXTRACTED_FROM}]->(n:${LABELS.NOTE})
  RETURN memoryId,
         n.id AS noteId,
         n.content AS noteContent,
         n.timestamp AS noteTimestamp
`;

/**
 * FETCH FULL ENTITY DETAILS BY NAME
 *
 * Fetches full entity details by name, handling both Entity and User nodes.
 * Used to build rich entity context for retrieval output.
 *
 * Why handle both Entity and User?
 * The User node is a special entity representing "the protagonist".
 * We want to show the user's actual name (e.g., "Hamza") not "USER",
 * and mark it with isUser=true for special handling.
 *
 * Note: User is never considered well-known (hardcoded false in application layer).
 */
export const GET_ENTITIES_BY_NAME = `
  UNWIND $names AS name
  OPTIONAL MATCH (e:${LABELS.ENTITY} {name: name})
  OPTIONAL MATCH (u:${LABELS.USER} {name: name})
  WITH name, e, u
  RETURN name,
         COALESCE(e.id, u.id) AS id,
         COALESCE(e.name, u.name) AS entityName,
         COALESCE(e.type, 'Person') AS type,
         COALESCE(e.description, u.description) AS description,
         COALESCE(e.isWellKnown, false) AS isWellKnown,
         u IS NOT NULL AS isUser
`;
