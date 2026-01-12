/**
 * Neo4j Schema Registry
 *
 * Single source of truth for all database schema elements.
 * Using constants prevents typos and enables IDE autocomplete.
 */

// ============================================================
// NODE LABELS
// ============================================================

/**
 * Node labels in the knowledge graph.
 *
 * - User: The person talking to the AI (singleton)
 * - Entity: Named concepts (people, projects, technologies)
 * - Memory: Extracted facts and knowledge
 * - Note: Raw memorize() input (provenance)
 */
export const LABELS = {
  USER: 'User',
  ENTITY: 'Entity',
  MEMORY: 'Memory',
  NOTE: 'Note'
} as const;

export type Label = (typeof LABELS)[keyof typeof LABELS];

// ============================================================
// RELATIONSHIP TYPES
// ============================================================

/**
 * Core relationship types in the knowledge graph.
 *
 * Structural relationships (fixed semantics):
 * - ABOUT: Memory -> Entity (what the memory is about)
 * - EXTRACTED_FROM: Memory -> Note (provenance link)
 * - MENTIONS: Note -> Entity (entity recognition)
 *
 * Temporal relationships (fact evolution):
 * - INVALIDATES: Memory -> Memory (newer fact supersedes older)
 *
 * Note: Entity-to-Entity relationships are expressed through shared memories,
 * not direct edges. The upstream LLM interprets relationships from memory content.
 */
export const RELS = {
  // Structural
  ABOUT: 'ABOUT',
  EXTRACTED_FROM: 'EXTRACTED_FROM',
  MENTIONS: 'MENTIONS',
  // Temporal
  INVALIDATES: 'INVALIDATES'
} as const;

export type RelType = (typeof RELS)[keyof typeof RELS];

// ============================================================
// INDEX NAMES
// ============================================================

/**
 * Index names for search operations.
 *
 * Vector indexes enable semantic similarity search.
 * Fulltext indexes enable keyword/phrase search.
 */
export const INDEXES = {
  // Vector indexes (cosine similarity)
  USER_VECTOR: 'user_vidx',
  MEMORY_VECTOR: 'memory_vidx',
  ENTITY_VECTOR: 'entity_vidx',
  // Fulltext indexes (Lucene)
  MEMORY_FULLTEXT: 'memory_ftxt',
  ENTITY_FULLTEXT: 'entity_ftxt'
} as const;

export type IndexName = (typeof INDEXES)[keyof typeof INDEXES];

// ============================================================
// RETRY CONFIGURATION
// ============================================================

/**
 * Retry settings for transient error handling.
 */
export const RETRY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 100
} as const;
