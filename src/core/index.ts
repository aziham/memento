/**
 * Core Memory System
 *
 * Public API barrel file. Re-exports consolidation and retrieval modules.
 *
 * @example
 * ```typescript
 * import { consolidate, retrieve } from '@/core';
 * import type { ConsolidationDependencies, RetrievalDependencies } from '@/core';
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Consolidation
// ═══════════════════════════════════════════════════════════════════════════════

export { type ConsolidationOutput, consolidate } from './consolidation';

export type {
  ConsolidationDependencies,
  ConsolidationInput,
  ConsolidationResult,
  EntityDecision,
  EntityType,
  MemoryDecision
} from './consolidation/schemas';

export type { ConsolidationOptions, PipelineStats } from './consolidation/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Retrieval
// ═══════════════════════════════════════════════════════════════════════════════

export { formatRetrievalOutput, retrieve } from './retrieval';

export type {
  RetrievalDependencies,
  RetrievalInput,
  RetrievalOptions
} from './retrieval/pipeline';

export type {
  EntityData,
  InvalidatedMemory,
  MemoryData,
  ProvenanceData,
  RetrievalOutput
} from './retrieval/types';
