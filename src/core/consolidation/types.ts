/**
 * Consolidation Types
 *
 * Non-Zod TypeScript types for the consolidation pipeline.
 * Zod schemas remain in schemas.ts for LLM output validation.
 */

import type { EntityType } from '@/providers/graph/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Entity Search Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Result from entity search */
export interface EntitySearchResult {
  id: string;
  name: string;
  type: EntityType;
  description: string | null;
  similarity: number;
}

/** Entity search result with the query embedding for reuse */
export interface EntitySearchWithEmbedding {
  queryEmbedding: number[];
  results: EntitySearchResult[];
}

/** Entity to search for, with name and description */
export interface EntityToSearch {
  name: string;
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LLM Config Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Internal configuration for LLM calls within pipeline phases.
 */
export interface LLMConfig {
  maxRetries: number;
  temperature: number;
  maxTokens: number;
  options?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for the consolidation pipeline.
 * These come from config.llm.consolidation in memento.json.
 */
export interface ConsolidationOptions {
  temperature: number;
  maxTokens: number;
  maxRetries: number;
  /** Provider-specific options (e.g., reasoning_effort) */
  options?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline Stats Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Statistics from pipeline execution */
export interface PipelineStats {
  totalLLMCalls: number;
  totalRetries: number;
}
