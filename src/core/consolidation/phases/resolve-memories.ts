/**
 * Resolve Memories Phase
 *
 * Resolves extracted memories against existing memories from the knowledge graph.
 * Uses shared context approach - all existing memories are shown to the LLM
 * instead of per-memory search results.
 *
 * Input: Extracted memories + existing memories from retrieval
 * Output: Memory decisions (ADD, SKIP, INVALIDATE)
 */

import type { MemoryData } from '@/core/retrieval/types';
import type { LLMClient } from '@/providers/llm/types';
import {
  type ResolveMemoriesInput as AgentInput,
  resolveMemories as resolveMemoriesAgent
} from '../agents/memory-resolver';
import type { ExtractedMemory, MemoryDecision } from '../schemas';
import type { LLMConfig, PipelineStats } from '../types';
import { assertDefined, callAgent } from '../utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ResolveMemoriesInput {
  /** Memories extracted from the current note */
  extractedMemories: ExtractedMemory[];
  /** Existing memories from retrieval + HyDE (shared context) */
  existingMemories: MemoryData[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve extracted memories against existing graph memories.
 *
 * 1. Build input for memory-resolver agent (shared context format)
 * 2. Call memory-resolver agent
 * 3. Build MemoryDecision objects
 *
 * Note: Embeddings are no longer attached here - they're computed in write-graph.
 *
 * @param input - Extracted memories and existing memories
 * @param llmClient - LLM client for agent call
 * @param llmConfig - LLM configuration
 * @param stats - Pipeline stats to update
 * @returns Memory decisions
 */
export async function resolveMemories(
  input: ResolveMemoriesInput,
  llmClient: LLMClient,
  llmConfig: LLMConfig,
  stats: PipelineStats
): Promise<MemoryDecision[]> {
  const { extractedMemories, existingMemories } = input;

  if (extractedMemories.length === 0) return [];

  // Build agent input with shared context
  const agentInput: AgentInput = {
    extractedMemories,
    existingMemories
  };

  // Call the memory-resolver agent
  const decisions = await callAgent(resolveMemoriesAgent, agentInput, llmClient, llmConfig, stats);

  // Validate LLM output alignment - must have same number of decisions as memories
  if (decisions.length !== extractedMemories.length) {
    throw new Error(
      `LLM returned ${decisions.length} decisions but expected ${extractedMemories.length}. ` +
        'The agent must return exactly one decision per input memory in the same order.'
    );
  }

  // Build MemoryDecision objects
  const resolvedMemories: MemoryDecision[] = [];

  for (let i = 0; i < decisions.length; i++) {
    const decision = assertDefined(decisions[i], `Missing decision for index ${i}`);
    const memory = assertDefined(extractedMemories[i], `Missing memory for index ${i}`);

    resolvedMemories.push({
      action: decision.action,
      content: memory.content,
      aboutEntities: memory.aboutEntities,
      validAt: memory.validAt ?? undefined,
      // Embedding will be computed in write-graph phase
      embedding: undefined,
      // Pass through the invalidates array from LLM decision
      invalidates: decision.invalidates,
      reason: decision.reason
    });
  }

  return resolvedMemories;
}
