/**
 * Retrieval Pipeline Orchestrator
 *
 * Orchestrates the 5-phase retrieval pipeline:
 * LAND → ANCHOR → EXPAND → DISTILL → TRACE
 *
 * Currently zero-LLM retrieval - pure algorithmic approach.
 * LLM dependencies included for future LLM-augmented retrieval.
 */

import type { EmbeddingClient } from '@/providers/embedding/types';
import type { GraphClient } from '@/providers/graph/types';
import type { LLMClient } from '@/providers/llm/types';
import { createConfig, defaults, type RetrievalConfig } from './config';
import { formatRetrievalOutput } from './format';
import { anchor, distill, expand, land, trace } from './phases';
import type { RetrievalOutput } from './types';

/**
 * Input for the retrieval pipeline.
 */
export interface RetrievalInput {
  /** Text query for fulltext search */
  query: string;
  /** Query embedding for vector search */
  queryEmbedding: number[];
}

/**
 * Dependencies for the retrieval pipeline.
 * LLM and embedding clients included for future LLM-augmented retrieval.
 */
export interface RetrievalDependencies {
  /** Graph client for database operations */
  graphClient: GraphClient;
  /** Embedding client for vector operations */
  embeddingClient: EmbeddingClient;
  /** LLM client for future LLM-augmented retrieval */
  llmClient: LLMClient;
}

/**
 * Options for the retrieval pipeline.
 * These come from config.llm.retrieval in memento.json.
 */
export interface RetrievalOptions {
  /** Return formatted string instead of JSON (default: false) */
  format?: boolean;
  /** Override internal retrieval config (damping, weights, etc.) */
  config?: Partial<RetrievalConfig>;
  /** LLM settings from config.llm.retrieval (for future LLM-augmented retrieval) */
  llm?: {
    temperature: number;
    maxTokens: number;
    maxRetries: number;
    options?: Record<string, unknown>;
  };
}

/**
 * Execute the retrieval pipeline.
 *
 * Pipeline phases:
 * 1. **LAND**: Cast wide net with vector + fulltext search
 * 2. **ANCHOR**: Find anchor entities from seed memories
 * 3. **EXPAND**: Walk graph outward from anchors via SEM-PPR
 * 4. **DISTILL**: Fuse signals and select diverse results
 * 5. **TRACE**: Build rich output with graph context
 *
 * @param input - Query and embedding
 * @param deps - Graph, embedding, and LLM clients
 * @param options - Output options and config overrides
 * @returns RetrievalOutput (or formatted string if options.format is true)
 *
 * @example
 * ```typescript
 * // Get structured output
 * const result = await retrieve(
 *   { query: "my coding preferences", queryEmbedding: [...] },
 *   { graphClient, embeddingClient, llmClient }
 * );
 *
 * // Get formatted string for LLM consumption
 * const formatted = await retrieve(
 *   { query: "my coding preferences", queryEmbedding: [...] },
 *   { graphClient, embeddingClient, llmClient },
 *   { format: true }
 * );
 * ```
 */
export async function retrieve(
  input: RetrievalInput,
  deps: RetrievalDependencies,
  options?: RetrievalOptions
): Promise<RetrievalOutput | string> {
  const startTime = Date.now();
  const config = options?.config ? createConfig(options.config) : defaults;
  const { graphClient } = deps;
  const { query, queryEmbedding } = input;

  // deps.embeddingClient and deps.llmClient available for future LLM-augmented retrieval
  // options?.llm available for future LLM settings

  // Phase 1: LAND - Cast wide net with vector + fulltext search
  const landResults = await land(graphClient, query, queryEmbedding, config);

  // Phase 2: ANCHOR - Find anchor entities from seed memories
  const anchorEntities = await anchor(graphClient, landResults, queryEmbedding, config);

  // Phase 3: EXPAND - Walk graph outward from anchors via SEM-PPR
  const expandResults = await expand(graphClient, anchorEntities, queryEmbedding, config);

  // Phase 4: DISTILL - Fuse signals and select diverse results
  const distillResults = distill(landResults, expandResults, config);

  // Phase 5: TRACE - Build rich output with graph context
  const durationMs = Date.now() - startTime;
  const totalCandidates = landResults.length + expandResults.length;

  const output = await trace(
    graphClient,
    query,
    distillResults,
    anchorEntities,
    totalCandidates,
    durationMs
  );

  // Return formatted string if requested
  if (options?.format) {
    return formatRetrievalOutput(output);
  }

  return output;
}
