/**
 * Consolidation Pipeline
 *
 * Two parallel branches that join for memory resolution:
 *
 * Branch A: Context Retrieval
 *   1. Embed note content
 *   2. Call retrieval pipeline
 *   3. HyDE augmentation
 *   4. Merge and return top K memories
 *
 * Branch B: Entity & Memory Extraction
 *   1. Extract entities (LLM)
 *   2. Search entities (embed + hybrid search)
 *   3. Resolve entities (LLM)
 *   4. Extract memories (LLM)
 *
 * Join: Resolve Memories
 *   - LLM sees ALL extracted + ALL existing memories
 *   - Decides: ADD / SKIP / INVALIDATE
 *
 * Write Graph (called separately in index.ts):
 *   - Embed memories
 *   - Write to Neo4j
 */

import type { EmbeddingClient } from '@/providers/embedding/types';
import type { GraphClient } from '@/providers/graph/types';
import type { LLMClient } from '@/providers/llm/types';
import { defaults as searchDefaults } from './config';
import {
  extractEntities,
  extractMemories,
  resolveEntities,
  resolveMemories,
  retrieveContext,
  searchEntities
} from './phases';
import type {
  ConsolidationDependencies,
  ConsolidationInput,
  EntityDecision,
  ExtractedMemory,
  MemoryDecision,
  UserDescriptionUpdate
} from './schemas';
import type { ConsolidationOptions, LLMConfig, PipelineStats } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface PipelineResult {
  entities: EntityDecision[];
  memories: MemoryDecision[];
  /** User description update decision (null if no biographical facts extracted) */
  userDescriptionUpdate: UserDescriptionUpdate | null;
  stats: PipelineStats;
}

// Re-export for backwards compatibility
export type { PipelineStats } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the consolidation pipeline.
 *
 * @param input - The note content and timestamp
 * @param deps - Dependencies (graph, embedding, LLM clients)
 * @param options - Pipeline options (temperature, maxTokens, etc. from config.llm.consolidation)
 * @param userName - The user's known name (if any) for context
 */
export async function runPipeline(
  input: ConsolidationInput,
  deps: ConsolidationDependencies,
  options: ConsolidationOptions,
  userName: string | null = null
): Promise<PipelineResult> {
  const { graphClient, embeddingClient, llmClient } = deps;

  const llmConfig: LLMConfig = {
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    maxRetries: options.maxRetries,
    options: options.options
  };
  const stats: PipelineStats = { totalLLMCalls: 0, totalRetries: 0 };

  // ═══════════════════════════════════════════════════════════════════════════
  // Run Branch A and Branch B in PARALLEL
  // ═══════════════════════════════════════════════════════════════════════════

  const [branchAResult, branchBResult] = await Promise.all([
    // Branch A: Context Retrieval
    retrieveContext(
      { noteContent: input.content },
      { graphClient, embeddingClient, llmClient },
      {
        topK: searchDefaults.contextTopK,
        hydeTemperature: searchDefaults.hydeTemperature,
        hydeResultsPerDoc: searchDefaults.hydeResultsPerDoc
      },
      llmConfig,
      stats
    ),

    // Branch B: Entity & Memory Extraction
    runEntityMemoryBranch(
      input,
      { graphClient, embeddingClient, llmClient },
      llmConfig,
      stats,
      userName
    )
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Join: Resolve Memories
  // ═══════════════════════════════════════════════════════════════════════════

  const resolvedMemories = await resolveMemories(
    {
      extractedMemories: branchBResult.extractedMemories,
      existingMemories: branchAResult.memories
    },
    llmClient,
    llmConfig,
    stats
  );

  return {
    entities: branchBResult.resolvedEntities,
    memories: resolvedMemories,
    userDescriptionUpdate: branchBResult.userDescriptionUpdate,
    stats
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Branch B: Entity & Memory Extraction
// ═══════════════════════════════════════════════════════════════════════════════

interface BranchBDependencies {
  graphClient: GraphClient;
  embeddingClient: EmbeddingClient;
  llmClient: LLMClient;
}

interface BranchBResult {
  extractedMemories: ExtractedMemory[];
  resolvedEntities: EntityDecision[];
  userDescriptionUpdate: UserDescriptionUpdate | null;
}

/**
 * Branch B: Entity & Memory Extraction
 *
 * Runs the entity/memory extraction phases sequentially.
 */
async function runEntityMemoryBranch(
  input: ConsolidationInput,
  deps: BranchBDependencies,
  llmConfig: LLMConfig,
  stats: PipelineStats,
  userName: string | null
): Promise<BranchBResult> {
  const { graphClient, embeddingClient, llmClient } = deps;

  // Phase 1: Extract entities
  const { entities: extractedEntities, userBiographicalFacts } = await extractEntities(
    { noteContent: input.content, userName },
    llmClient,
    llmConfig,
    stats
  );

  // Phase 2: Search entities
  const entitySearchResults = await searchEntities(extractedEntities, graphClient, embeddingClient);

  // Phase 3: Resolve entities
  const { entities: resolvedEntities, userDescriptionUpdate } = await resolveEntities(
    {
      extractedEntities,
      searchResults: entitySearchResults,
      userBiographicalFacts,
      graphClient
    },
    llmClient,
    llmConfig,
    stats
  );

  // Phase 4: Extract memories
  const extractedMemories = await extractMemories(
    {
      noteContent: input.content,
      noteTimestamp: input.timestamp,
      resolvedEntities
    },
    llmClient,
    llmConfig,
    stats
  );

  return { extractedMemories, resolvedEntities, userDescriptionUpdate };
}
