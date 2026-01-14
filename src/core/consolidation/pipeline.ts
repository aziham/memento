/**
 * Consolidation Pipeline
 *
 * Transforms a user's note into structured knowledge graph updates. The pipeline
 * uses a parallel architecture to maximize throughput while ensuring data consistency.
 *
 * Architecture: Two branches run in parallel, then join for final resolution:
 *
 * Branch A (Context Retrieval):
 *   Finds existing memories that might relate to or conflict with the new note.
 *   Uses the retrieval pipeline + HyDE augmentation to find semantically similar content.
 *   Output: Existing memories that the LLM will compare against.
 *
 * Branch B (Entity & Memory Extraction):
 *   Extracts structured information from the note using LLM:
 *   1. Extract entities (people, projects, technologies mentioned)
 *   2. Search for matching existing entities in the graph
 *   3. Resolve each entity: CREATE new or MATCH existing
 *   4. Extract memories (facts, preferences, events) linked to resolved entities
 *   Output: Extracted entities and memories ready for resolution.
 *
 * Why parallel? The branches are independent - context retrieval doesn't need
 * extracted entities, and extraction doesn't need existing memories. Running them
 * in parallel cuts latency roughly in half.
 *
 * Join Phase (Memory Resolution):
 *   The LLM sees ALL extracted memories from Branch B alongside ALL existing
 *   memories from Branch A. For each extracted memory, it decides:
 *   - ADD: New information, no conflicts with existing memories
 *   - SKIP: Duplicate of an existing memory (no value in storing again)
 *   - INVALIDATE: Contradicts/supersedes existing memory (creates INVALIDATES edge)
 *
 * Stats tracking: The pipeline tracks LLM call counts and retries for observability.
 * This helps diagnose issues and monitor costs.
 *
 * Note: Graph writing happens separately after this pipeline returns, allowing
 * the caller to review decisions before committing to the database.
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
 * Orchestrates the parallel branches and join phase. The stats object is passed
 * through all phases and mutated to track LLM usage - this is intentional to
 * avoid complex stat aggregation logic.
 *
 * @param input - The note content and timestamp
 * @param deps - Dependencies (graph, embedding, LLM clients)
 * @param options - Pipeline options (temperature, maxTokens, etc. from config.llm.consolidation)
 * @param userName - The user's known name (if any) for context in extraction prompts
 * @returns Entity decisions, memory decisions, optional user update, and stats
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
 * Runs sequentially within the branch because each phase depends on the previous:
 * - Entity search needs extracted entities to know what to search for
 * - Entity resolution needs search results to decide CREATE vs MATCH
 * - Memory extraction needs resolved entities to link memories correctly
 *
 * This sequential dependency is why Branch B is its own function - it encapsulates
 * the internal ordering while the outer pipeline only sees "run Branch B".
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
