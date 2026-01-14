/**
 * Consolidation Module
 *
 * Extracts entities and memories from notes into a knowledge graph.
 */

import { writeGraph } from './phases/write-graph';
import { runPipeline } from './pipeline';
import type { ConsolidationDependencies, ConsolidationInput, ConsolidationResult } from './schemas';
import type { ConsolidationOptions, PipelineStats } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConsolidationOutput {
  result: ConsolidationResult;
  noteId: string | null;
  entityIds: Map<string, string>;
  memoryIds: string[];
  stats: PipelineStats;
  skipped: boolean;
  skipReason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Consolidate a note into the knowledge graph.
 *
 * @param input - The note content and timestamp
 * @param deps - Dependencies (graph, embedding, LLM clients)
 * @param options - Pipeline options (temperature, maxTokens, etc. from config.llm.consolidation)
 * @returns Consolidation result with created entities and memories
 *
 * Returns skipped: true if the note was not stored because:
 * - No memories could be extracted
 * - All extracted memories were duplicates of existing knowledge
 */
export async function consolidate(
  input: ConsolidationInput,
  deps: ConsolidationDependencies,
  options: ConsolidationOptions
): Promise<ConsolidationOutput> {
  const { graphClient, embeddingClient } = deps;

  // Query the User node to get the known user name (for prompt context)
  const user = await graphClient.getUser();
  const userName = user?.name ?? null;

  // Run the pipeline with user name context (no input normalization - trust the LLM)
  const pipelineResult = await runPipeline(input, deps, options, userName);

  // Write to graph (with defensive filtering for exact user name matches)
  const writeResult = await writeGraph(
    {
      noteInput: input,
      entities: pipelineResult.entities,
      memories: pipelineResult.memories,
      userDescriptionUpdate: pipelineResult.userDescriptionUpdate
    },
    {
      graphClient,
      embeddingClient,
      userName
    }
  );

  return {
    result: { entities: pipelineResult.entities, memories: pipelineResult.memories },
    noteId: writeResult.noteId,
    entityIds: writeResult.entityIds,
    memoryIds: writeResult.memoryIds,
    stats: pipelineResult.stats,
    skipped: writeResult.skipped,
    skipReason: writeResult.skipReason
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export types from schemas
export type {
  ConsolidationDependencies,
  ConsolidationInput,
  ConsolidationResult,
  EntityDecision,
  EntityType,
  MemoryDecision
} from './schemas';

// Re-export types from types
export type { ConsolidationOptions, PipelineStats } from './types';

// Re-export utilities
export { assertDefined, normalizeEntityName } from './utils';
