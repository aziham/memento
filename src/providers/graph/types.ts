/**
 * Graph Client Types
 *
 * Defines the contract and data types for graph database providers.
 * This is the persistence layer that Memento Core uses to store and retrieve data.
 */

// ============================================================
// ERROR TYPES
// ============================================================

/**
 * Standard error types that any graph implementation must map to.
 * This allows the Core Engine to handle errors consistently
 * regardless of the underlying database.
 */
export type GraphErrorType =
  | 'CONNECTION_ERROR' // Failed to connect to database
  | 'CONSTRAINT_VIOLATION' // Unique constraint violated
  | 'NOT_FOUND' // Node/edge not found
  | 'QUERY_ERROR' // Invalid query or execution error
  | 'TRANSIENT_ERROR'; // Temporary failure (retry possible)

/**
 * Standardized error class for graph operations.
 * All graph client implementations should throw this error type.
 */
export class GraphClientError extends Error {
  public override readonly cause?: Error;

  constructor(
    message: string,
    public readonly type: GraphErrorType,
    cause?: Error
  ) {
    super(message);
    this.name = 'GraphClientError';
    this.cause = cause;
  }

  /**
   * Whether this error is retryable (transient failures).
   */
  get retryable(): boolean {
    return this.type === 'TRANSIENT_ERROR';
  }
}

// ============================================================
// NODE TYPES
// ============================================================

/**
 * Entity type classification.
 *
 * A predefined set of 7 categories that cover most personal knowledge graph use cases.
 * Research shows LLMs perform well with 7±2 categories - more leads to confusion.
 *
 * - Person: People (colleagues, friends, family)
 * - Organization: Companies, teams, institutions
 * - Project: Software, initiatives, products you work on
 * - Technology: Languages, frameworks, tools, platforms (concrete things you USE)
 * - Location: Cities, countries, places
 * - Event: Conferences, meetings, milestones
 * - Concept: Fields, domains, methodologies, ideas (things you STUDY or KNOW ABOUT)
 */
export const ENTITY_TYPES = [
  'Person',
  'Organization',
  'Project',
  'Technology',
  'Location',
  'Event',
  'Concept'
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/**
 * Entity: Things that exist in the world - people, projects, tools, concepts.
 *
 * - `description` is a factual definition of what the entity IS (not user opinions)
 * - `embedding` is the vector embedding of "Name: Description" (for semantic search)
 * - `type` classifies the entity into one of 7 predefined categories
 */
export interface Entity {
  id: string; // UUID v7
  name: string; // "Hamza", "Memento", "Neo4j"
  type: EntityType; // Classification: Person, Organization, Project, etc.
  description: string | null; // Factual description: "A JavaScript runtime and toolkit"
  embedding: number[] | null; // Embedding of "Name: Description" for semantic search
  isWellKnown: boolean; // True if LLMs already know about this entity (Google, Python, etc.)
  created_at: string; // ISO 8601 - when first seen
  updated_at: string; // ISO 8601 - last update
}

/**
 * User: The person talking to the AI (singleton node).
 *
 * User is a special Entity with a fixed ID "USER".
 * - There is exactly one User per Memento instance
 * - First-person references ("I", "me", "my") always resolve to this node
 * - Created via `memento init`, not lazily during consolidation
 */
export interface User extends Omit<Entity, 'id'> {
  id: 'USER'; // Fixed constant ID (singleton)
}

/**
 * Memory: Pieces of knowledge - facts, events, learnings, preferences, rules.
 *
 * Memories are linked to entities via ABOUT edges. The upstream LLM interprets
 * the memory content directly - no type classification needed.
 */
export interface Memory {
  id: string; // UUID v7
  content: string; // The memory content
  embedding: number[] | null; // Vector for semantic search
  created_at: string; // When this memory was stored
  valid_at: string | null; // When this fact became true in the world
  invalid_at: string | null; // When this fact stopped being true (null = still true)
}

/**
 * Type-safe update payload for Memory nodes.
 * Only includes fields that are safe to update after creation.
 * Excludes: id, created_at (immutable)
 */
export type MemoryUpdate = Partial<
  Pick<Memory, 'content' | 'embedding' | 'valid_at' | 'invalid_at'>
>;

/**
 * Type-safe update payload for Entity nodes.
 * Only includes fields that are safe to update after creation.
 * Excludes: id, created_at, updated_at (auto-managed), type, isWellKnown (immutable classification)
 */
export type EntityUpdate = Partial<Pick<Entity, 'name' | 'description' | 'embedding'>>;

/**
 * Note: Raw input to memorize() - the source/provenance of memories.
 * Named "Note" to avoid collision with TypeScript's built-in Record<K,V> utility type.
 */
export interface Note {
  id: string; // UUID v7
  content: string; // The raw memorize() input
  timestamp: string; // When this occurred (ISO 8601)
}

// ============================================================
// EDGE TYPES
// ============================================================

/**
 * Base interface for all edges.
 */
export interface EdgeBase {
  id: string; // UUID v7
  created_at: string; // ISO 8601
}

/**
 * MENTIONS: Note -> Entity (single edge)
 * Links a note to ONE entity discussed in it.
 */
export interface MentionsEdge extends EdgeBase {
  noteId: string;
  entityId: string;
}

/**
 * EXTRACTED_FROM: Memory -> Note
 * Provenance - which Note was this Memory extracted from?
 * Each Memory has exactly ONE source Note (N:1 cardinality).
 */
export interface ExtractedFromEdge extends EdgeBase {
  memoryId: string;
  noteId: string;
}

/**
 * INVALIDATES: Memory -> Memory (single edge)
 * Connects a new memory to ONE old memory it contradicts.
 * The old fact was wrong or is no longer true due to new information.
 *
 * Example: "Use dot product" invalidates "Use cosine similarity"
 */
export interface InvalidatesEdge extends EdgeBase {
  newMemoryId: string;
  oldMemoryId: string;
  reason: string;
}

/**
 * ABOUT: Memory -> Entity (single edge)
 * Links a memory to ONE entity it concerns.
 */
export interface AboutEdge extends EdgeBase {
  memoryId: string;
  entityId: string;
}

// ============================================================
// INPUT TYPES (for creation - without auto-generated fields)
// ============================================================

/**
 * Input type for creating the User node (without auto-generated fields).
 */
export type CreateUserInput = Omit<User, 'id' | 'created_at' | 'updated_at'>;

/**
 * Input type for creating entities (without auto-generated fields).
 */
export type CreateEntityInput = Omit<Entity, 'id' | 'created_at' | 'updated_at'>;

/**
 * Input type for creating memories (without auto-generated fields)
 */
export type CreateMemoryInput = Omit<Memory, 'id' | 'created_at'>;

/**
 * Input type for creating notes (without auto-generated fields)
 */
export type CreateNoteInput = Omit<Note, 'id'>;

// ============================================================
// SEARCH TYPES
// ============================================================

/**
 * Search result with similarity/relevance score
 */
export interface SearchResult<T> {
  node: T;
  score: number;
}

/**
 * Result from Personalized PageRank with memory and score
 */
export interface PPRResult {
  memory: Memory;
  score: number;
}

/**
 * Entity with its degree (number of ABOUT relationships)
 */
export interface EntityWithDegree {
  entity: Entity;
  /** Number of ABOUT relationships (memories about this entity) */
  degree: number;
}

/**
 * Invalidated memory data with reason and chain
 */
export interface InvalidatedMemoryData {
  /** Memory ID */
  id: string;
  /** Memory content */
  content: string;
  /** When this memory became valid (ISO 8601), null if not set */
  validAt: string | null;
  /** When this memory was invalidated (ISO 8601), null if not set */
  invalidatedAt: string | null;
  /** Why this memory was invalidated, null if not set */
  reason: string | null;
  /** Memories that this invalidated memory also invalidated (hop 2) */
  invalidated?: {
    id: string;
    content: string;
    validAt: string | null;
    invalidatedAt: string | null;
    reason: string | null;
  }[];
}

/**
 * Provenance data (source Note) for a memory
 */
export interface ProvenanceData {
  /** Note ID */
  noteId: string;
  /** Original note content */
  noteContent: string;
  /** When the note was created (ISO 8601) */
  noteTimestamp: string;
}

/**
 * Entity data for retrieval output
 */
export interface EntityData {
  /** Entity ID (UUID, or 'USER' for the user node) */
  id: string;
  /** Entity name (actual name, e.g., 'Hamza' not 'USER') */
  name: string;
  /** Entity type */
  type: string;
  /** Factual description of what this entity is */
  description: string | null;
  /** True if LLMs already know about this entity (Google, Python, etc.) */
  isWellKnown: boolean;
  /** True if this is the User node */
  isUser: boolean;
}

// ============================================================
// CLIENT INTERFACE
// ============================================================

/**
 * GraphClient Interface
 *
 * The persistence layer for Memento's knowledge graph.
 * Handles all database operations but does not make decisions about
 * what to store or how to score results - that logic belongs in Core.
 */
export interface GraphClient {
  // ============================================================
  // CONNECTION PROPERTIES (for advanced operations)
  // ============================================================

  /**
   * The underlying database driver.
   * Used for advanced operations like GDS algorithms.
   */
  readonly driver: unknown;

  /**
   * The database name.
   */
  readonly database: string;

  // ============================================================
  // CONNECTION MANAGEMENT
  // ============================================================

  /**
   * Establish connection to the database.
   * Verifies connectivity at startup (fail-fast).
   */
  connect(): Promise<void>;

  /**
   * Close all connections and release resources.
   */
  disconnect(): Promise<void>;

  /**
   * Check if the database is reachable and healthy.
   */
  healthCheck(): Promise<boolean>;

  // ============================================================
  // SCHEMA MANAGEMENT
  // ============================================================

  /**
   * Initialize database schema (constraints, indexes).
   * Safe to call multiple times (idempotent).
   * Handles concurrent index creation errors gracefully.
   *
   * @param dimensions - Vector embedding dimensions for vector indexes
   */
  initializeSchema(dimensions: number): Promise<void>;

  // ============================================================
  // USER OPERATIONS (singleton node)
  // ============================================================

  /**
   * Get the User node.
   * Returns null if User doesn't exist yet.
   */
  getUser(): Promise<User | null>;

  /**
   * Create the User node (singleton).
   * Should only be called once - use getOrCreateUser for safe creation.
   */
  createUser(user: CreateUserInput): Promise<User>;

  /**
   * Update the User node.
   * Updates name, description, or embedding.
   */
  updateUser(updates: Partial<Pick<User, 'name' | 'description' | 'embedding'>>): Promise<User>;

  /**
   * Get or create the User node.
   * Creates with defaults if doesn't exist, returns existing if it does.
   */
  getOrCreateUser(defaults: CreateUserInput): Promise<User>;

  // ============================================================
  // NODE OPERATIONS - BULK (for high-throughput consolidation)
  // ============================================================

  /**
   * Create multiple entities in a single transaction.
   * Uses UNWIND + MERGE for performance and idempotency.
   */
  createEntities(entities: CreateEntityInput[]): Promise<Entity[]>;

  /**
   * Create multiple memories in a single transaction.
   * Uses UNWIND + MERGE for performance.
   */
  createMemories(memories: CreateMemoryInput[]): Promise<Memory[]>;

  /**
   * Create multiple notes in a single transaction.
   * Uses UNWIND + MERGE for performance.
   */
  createNotes(notes: CreateNoteInput[]): Promise<Note[]>;

  // ============================================================
  // NODE OPERATIONS - INDIVIDUAL LOOKUPS
  // ============================================================

  /**
   * Get an entity by its UUID.
   */
  getEntityById(id: string): Promise<Entity | null>;

  /**
   * Get an entity by its unique name.
   */
  getEntityByName(name: string): Promise<Entity | null>;

  /**
   * Get multiple entities by name with their degree (ABOUT relationship count).
   * Used by ANCHOR phase for multi-signal entity weighting.
   * Degree represents structural importance in the knowledge graph.
   *
   * @param names - Entity names to look up
   * @returns Entities with their degree counts
   */
  getEntitiesWithDegree(names: string[]): Promise<EntityWithDegree[]>;

  /**
   * Get a memory by its UUID.
   */
  getMemoryById(id: string): Promise<Memory | null>;

  /**
   * Get a note by its UUID.
   */
  getNoteById(id: string): Promise<Note | null>;

  /**
   * Update a memory's metadata (invalid_at, etc.)
   * Only allows updating safe fields: content, embedding, valid_at, invalid_at
   */
  updateMemory(id: string, updates: MemoryUpdate): Promise<Memory>;

  /**
   * Update an entity's metadata (summary, embedding, etc.)
   * Only allows updating safe fields: name, description, embedding
   */
  updateEntity(id: string, updates: EntityUpdate): Promise<Entity>;

  // ============================================================
  // NODE OPERATIONS - DELETE
  // ============================================================

  /**
   * Delete nodes by their UUIDs.
   * Also deletes any edges connected to these nodes.
   */
  deleteNodes(ids: string[]): Promise<void>;

  // ============================================================
  // STRUCTURAL EDGE OPERATIONS
  // ============================================================

  /**
   * Create MENTIONS edge: Note -> Entity
   * Links a note to an entity discussed in it.
   *
   * @returns The edge UUID
   */
  createMentionsEdge(noteId: string, entityId: string): Promise<string>;

  /**
   * Create EXTRACTED_FROM edge: Memory -> Note
   * Establishes provenance for a memory.
   * Each Memory has exactly ONE source Note (N:1 cardinality).
   *
   * @returns The edge UUID
   */
  createExtractedFromEdge(memoryId: string, noteId: string): Promise<string>;

  /**
   * Create INVALIDATES edge: Memory -> Memory
   * Records that a new memory contradicts or updates an old one.
   *
   * @returns The edge UUID
   */
  createInvalidatesEdge(newMemoryId: string, oldMemoryId: string, reason: string): Promise<string>;

  /**
   * Create ABOUT edge: Memory -> Entity
   * Links a memory to an entity it concerns.
   *
   * @returns The edge UUID
   */
  createAboutEdge(memoryId: string, entityId: string): Promise<string>;

  /**
   * Create ABOUT edge: Memory -> User
   * Links a memory to the User node.
   *
   * @returns The edge UUID
   */
  createAboutUserEdge(memoryId: string): Promise<string>;

  // ============================================================
  // SEARCH PRIMITIVES
  // ============================================================

  /**
   * Vector similarity search on Memory or Entity nodes.
   * Returns raw results with similarity scores.
   *
   * @param label - Node label to search ('Memory' or 'Entity')
   * @param vector - Query vector (must be L2 normalized)
   * @param limit - Maximum number of results
   * @param options - Optional search options
   * @param options.validOnly - Filter to only return valid memories (invalid_at IS NULL). Only applicable for Memory searches.
   */
  searchVector(
    label: 'Memory' | 'Entity',
    vector: number[],
    limit: number,
    options?: { validOnly?: boolean }
  ): Promise<SearchResult<Memory | Entity>[]>;

  /**
   * Fulltext search on Memory or Entity nodes.
   * Returns raw results with relevance scores.
   *
   * @param label - Node label to search ('Memory' or 'Entity')
   * @param query - Search query (will be sanitized for Lucene)
   * @param limit - Maximum number of results
   * @param options - Optional search options
   * @param options.validOnly - Filter to only return valid memories (invalid_at IS NULL). Only applicable for Memory searches.
   */
  searchFulltext(
    label: 'Memory' | 'Entity',
    query: string,
    limit: number,
    options?: { validOnly?: boolean }
  ): Promise<SearchResult<Memory | Entity>[]>;

  /**
   * Hybrid search combining vector similarity and fulltext (BM25) search.
   * Uses Reciprocal Rank Fusion (RRF) to combine results.
   *
   * @param label - Node label to search ('Memory' or 'Entity')
   * @param query - Text query for fulltext search
   * @param vector - Query vector for similarity search
   * @param limit - Maximum number of results to return
   * @param options - Optional search options
   * @param options.validOnly - Filter to only return valid memories (invalid_at IS NULL). Only applicable for Memory searches.
   * @returns Combined results ranked by RRF score
   */
  searchHybrid(
    label: 'Memory' | 'Entity',
    query: string,
    vector: number[],
    limit: number,
    options?: { validOnly?: boolean }
  ): Promise<SearchResult<Memory | Entity>[]>;

  // ============================================================
  // TRAVERSAL
  // ============================================================

  /**
   * Get memories reachable from anchor entities via graph traversal.
   * Traversal goes through ABOUT edges: Entity -[ABOUT]- Memory -[ABOUT]- Entity
   *
   * Performs 1 semantic hop: finds memories about entities that share memories
   * with the anchor entities.
   *
   * @param anchorIds - Entity or User IDs to start traversal from
   */
  getNeighborhood(anchorIds: string[]): Promise<Memory[]>;

  /**
   * Get the entity names that memories are about.
   *
   * Given a list of memory IDs, returns a map of memoryId -> entityNames[].
   * Handles both Entity and User nodes.
   *
   * @param memoryIds - Memory IDs to look up
   * @returns Map of memoryId to array of entity names
   */
  getMemoryAboutEntities(memoryIds: string[]): Promise<Map<string, string[]>>;

  /**
   * Run Personalized PageRank on the knowledge graph.
   *
   * Performs graph traversal using Personalized PageRank algorithm to find
   * memories structurally connected to source entities. Used in retrieval's
   * EXPAND phase for Semantic-Enhanced PPR (SEM-PPR).
   *
   * @param sourceNodeIds - Entity IDs to use as PPR source nodes
   * @param damping - Damping factor (0.75 recommended for knowledge graphs)
   * @param iterations - Max iterations for convergence
   * @param limit - Max results to return
   * @returns Memories with PPR scores, sorted by score descending
   */
  runPersonalizedPageRank(
    sourceNodeIds: string[],
    damping: number,
    iterations: number,
    limit: number
  ): Promise<PPRResult[]>;

  /**
   * Get invalidation chains for memories (2 hops).
   * Returns memories that were invalidated by the given memories,
   * plus memories invalidated by those (hop 2).
   *
   * @param memoryIds - Memory IDs to look up
   * @returns Map of memoryId to array of invalidated memories
   */
  getMemoryInvalidates(memoryIds: string[]): Promise<Map<string, InvalidatedMemoryData[]>>;

  /**
   * Get provenance (source Note) for memories.
   *
   * @param memoryIds - Memory IDs to look up
   * @returns Map of memoryId to provenance data
   */
  getMemoryProvenance(memoryIds: string[]): Promise<Map<string, ProvenanceData>>;

  /**
   * Get entity data by names (bulk operation).
   * Used by TRACE phase to build rich entity context.
   *
   * @param names - Entity names to look up
   * @returns Map of entity name to entity data
   */
  getEntitiesByName(names: string[]): Promise<Map<string, EntityData>>;

  // ============================================================
  // TRANSACTION SUPPORT
  // ============================================================

  /**
   * Execute multiple operations in a single atomic transaction.
   * All operations either succeed together or fail together (rollback).
   *
   * The callback receives a transaction-scoped client that supports
   * write operations. If the callback throws, the transaction is rolled back.
   *
   * @param fn - Async function that performs operations using the transaction client
   * @returns The result of the callback function
   * @throws GraphClientError if the transaction fails
   *
   * @example
   * ```typescript
   * await graphClient.executeTransaction(async (tx) => {
   *   const [note] = await tx.createNotes([noteInput]);
   *   const entities = await tx.createEntities(entityInputs);
   *   const memories = await tx.createMemories(memoryInputs);
   *   await tx.createAboutEdge(memories[0].id, entities[0].id);
   * });
   * ```
   */
  executeTransaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
}

/**
 * Transaction-scoped client for atomic operations.
 * Provides write operations that run within a single transaction.
 * Read operations are not included - use the main GraphClient for reads before the transaction.
 */
export interface TransactionClient {
  // Node creation
  createEntities(entities: CreateEntityInput[]): Promise<Entity[]>;
  createMemories(memories: CreateMemoryInput[]): Promise<Memory[]>;
  createNotes(notes: CreateNoteInput[]): Promise<Note[]>;

  // User operations
  getOrCreateUser(defaults: CreateUserInput): Promise<User>;
  updateUser(updates: Partial<Pick<User, 'name' | 'description' | 'embedding'>>): Promise<User>;

  // Node updates (type-safe: only allows updating safe fields)
  updateMemory(id: string, updates: MemoryUpdate): Promise<Memory>;
  updateEntity(id: string, updates: EntityUpdate): Promise<Entity>;

  // Edge creation
  createMentionsEdge(noteId: string, entityId: string): Promise<string>;
  createExtractedFromEdge(memoryId: string, noteId: string): Promise<string>;
  createInvalidatesEdge(newMemoryId: string, oldMemoryId: string, reason: string): Promise<string>;
  createAboutEdge(memoryId: string, entityId: string): Promise<string>;
  createAboutUserEdge(memoryId: string): Promise<string>;
}
