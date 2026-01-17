/**
 * Retrieval Pipeline Types
 *
 * Type definitions for the LAND → ANCHOR → EXPAND → DISTILL → TRACE pipeline.
 * Also includes shared types previously in @/core/shared/types.
 */

import type {
  Entity,
  EntityData as GraphEntityData,
  Memory,
  ProvenanceData
} from '@/providers/graph/types';

// Re-export ProvenanceData from graph (identical type)
export type { ProvenanceData } from '@/providers/graph/types';

/**
 * Entity with full details from the graph, extended with retrieval context.
 * Extends GraphEntityData with memoryCount for retrieval output.
 */
export interface EntityData extends GraphEntityData {
  /** How many memories in this result reference this entity */
  memoryCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared Types (merged from @/core/shared/types)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * How a result was discovered during search/retrieval.
 */
export type RetrievalMethod = 'vector' | 'fulltext' | 'sem-ppr' | 'multiple';

/**
 * A ranked result from any search operation.
 * Generic over the result type (Memory, Entity, etc.)
 */
export interface RankedResult<T> {
  /** The actual result item */
  result: T;
  /** Relevance score (0-1 after normalization) */
  score: number;
  /** How this result was discovered */
  source: RetrievalMethod;
}

/**
 * A ranked result that includes vector embedding for semantic operations.
 * Used by SEM-PPR and other embedding-aware algorithms.
 */
export interface EmbeddedRankedResult<T> {
  /** The actual result item */
  result: T;
  /** Relevance score (0-1 after normalization) */
  score: number;
  /** Vector embedding for semantic similarity computation */
  embedding?: number[];
}

/**
 * Statistical properties of a score distribution.
 * Used for normalizing scores from different sources to be comparable.
 */
export interface ScoreDistribution {
  mean: number;
  standardDeviation: number;
}

/**
 * Configuration for fusing results from multiple search sources.
 */
export interface SearchFusionConfig {
  /** Weight for vector (semantic) search results (0-1) */
  vectorWeight: number;
  /** Weight for fulltext (keyword) search results (0-1) */
  fulltextWeight: number;
  /** Minimum results needed before applying full weight (coverage penalty below this) */
  minResultsForFullWeight: number;
  /** Minimum score threshold for including results (optional) */
  qualityThreshold?: number;
  /** Target distribution for score alignment */
  targetDistribution: ScoreDistribution;
}

/**
 * Configuration for Semantic-Enhanced Personalized PageRank.
 */
export interface SemanticPPRConfig {
  /** Weight for graph structure vs semantic similarity (0-1, where 1 = pure structure) */
  structureWeight: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline Output Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Complete retrieval output with full graph context.
 * Designed to give LLMs a "window into the graph".
 */
export interface RetrievalOutput {
  /** The query that triggered this retrieval */
  query: string;

  /** All entities involved in retrieved memories */
  entities: EntityData[];

  /** Ranked memories with full graph context */
  memories: MemoryData[];

  /** Metadata for debugging/observability */
  meta: {
    totalCandidates: number;
    durationMs: number;
  };
}

/**
 * Memory with full graph context.
 */
export interface MemoryData {
  /** Position in ranked results (1-based) */
  rank: number;

  /** Memory ID (UUID) */
  id: string;

  /** The actual memory content */
  content: string;

  /** Relevance score (0-1) */
  score: number;

  /** How this memory was found: vector, fulltext, sem-ppr, multiple */
  source: RetrievalMethod;

  /** Entity names this memory is about (uses User's actual name) */
  about: string[];

  /** Entity IDs this memory is about (includes 'USER' for user node) */
  aboutEntityIds: string[];

  /** When this fact became true (ISO 8601) */
  validAt: string | null;

  /**
   * Memories that THIS memory directly invalidates (hop 1),
   * and what those invalidated memories also invalidated (hop 2).
   * Max 2 hops deep.
   */
  invalidates?: InvalidatedMemory[];

  /** Provenance - the original note this was extracted from */
  extractedFrom?: ProvenanceData;
}

/**
 * A memory that was invalidated, with full context.
 */
export interface InvalidatedMemory {
  /** Memory ID */
  id: string;

  /** The invalidated memory's content */
  content: string;

  /** When this memory became valid (ISO 8601), null if not set */
  validAt: string | null;

  /** When this memory was invalidated (ISO 8601), null if not set */
  invalidatedAt: string | null;

  /** Why this memory was invalidated (from INVALIDATES edge), null if not set */
  reason: string | null;

  /**
   * Memories that THIS invalidated memory also invalidated (hop 2).
   * We stop here - no further hops.
   */
  invalidated?: {
    id: string;
    content: string;
    validAt: string | null;
    invalidatedAt: string | null;
    reason: string | null;
  }[];
}

/**
 * Provenance information - where did this memory come from?
 * Re-exported from graph types (identical structure).
 */
// ProvenanceData is re-exported from graph types at the top of this file

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Pipeline Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Memory with a score - used internally throughout the pipeline.
 * This is RankedResult<Memory> with an optional field for entity names.
 */
export interface ScoredMemory extends RankedResult<Memory> {
  /** Entity names this memory is about (populated in ANCHOR phase) */
  aboutEntityNames?: string[];
}

/**
 * Entity with weight for PPR personalization.
 */
export interface WeightedEntity {
  /** The entity node */
  entity: Entity;

  /** Weight for PPR personalization (higher = more teleport probability) */
  weight: number;
}

/**
 * Entity with additional details needed for multi-signal weighting.
 */
export interface EntityWithDetails {
  /** Entity name */
  name: string;

  /** Entity embedding ("Name: Description" vector) */
  embedding: number[] | null;

  /** Number of ABOUT relationships (degree centrality) */
  degree: number;
}
