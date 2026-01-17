/**
 * Retrieval Module
 *
 * Zero-LLM retrieval system using a 5-phase pipeline:
 * LAND → ANCHOR → EXPAND → DISTILL → TRACE
 *
 * Combines vector search, fulltext search, graph traversal (SEM-PPR),
 * and diversity filtering (MMR) without any LLM calls.
 */

// Algorithms (for advanced usage / testing)
export {
  // Shared algorithms (re-exported)
  alignScoreDistribution,
  applySemanticPPRBoost,
  // Retrieval-specific algorithms
  computeAdaptiveLambda,
  computeCosineSimilarity,
  computeCoverageAdjustedWeights,
  fuseSearchResults,
  mmrRerank,
  normalizeToUnitRange
} from './algorithms';

// Configuration
export type { RetrievalConfig } from './config';
export { createConfig, defaults } from './config';

// Formatting
export { formatRetrievalOutput } from './format';

// Phases (for advanced usage / testing)
export { anchor, distill, expand, land, trace } from './phases';

// Pipeline (main entry point)
export type { RetrievalDependencies, RetrievalInput, RetrievalOptions } from './pipeline';
export { retrieve } from './pipeline';

// Types
export type {
  // Output types
  EntityData,
  // Internal types (for advanced usage)
  EntityWithDetails,
  InvalidatedMemory,
  MemoryData,
  ProvenanceData,
  // Shared types (re-exported)
  RankedResult,
  RetrievalMethod,
  RetrievalOutput,
  ScoredMemory,
  WeightedEntity
} from './types';
