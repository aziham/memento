/**
 * Extract Memories Phase
 *
 * Fourth phase of the consolidation pipeline.
 * Calls the memory-extractor agent to extract memories from the note.
 *
 * Input: Note content + resolved entities
 * Output: Extracted memories
 */

import type { LLMClient } from '@/providers/llm/types';
import { extractMemories as extractMemoriesAgent } from '../agents/memory-extractor';
import type { EntityDecision, ExtractedMemory } from '../schemas';
import type { LLMConfig, PipelineStats } from '../types';
import { callAgent } from '../utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExtractMemoriesInput {
  noteContent: string;
  noteTimestamp: string;
  resolvedEntities: EntityDecision[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract memories from note content.
 *
 * 1. Call memory-extractor agent with note and resolved entities
 * 2. Return extracted memories
 *
 * @param input - Note content, timestamp, and resolved entities
 * @param llmClient - LLM client for agent call
 * @param llmConfig - LLM configuration
 * @param stats - Pipeline stats to update
 * @returns Extracted memories
 */
export async function extractMemories(
  input: ExtractMemoriesInput,
  llmClient: LLMClient,
  llmConfig: LLMConfig,
  stats: PipelineStats
): Promise<ExtractedMemory[]> {
  // Call the memory-extractor agent
  const memories = await callAgent(
    extractMemoriesAgent,
    {
      noteContent: input.noteContent,
      noteTimestamp: input.noteTimestamp,
      resolvedEntities: input.resolvedEntities.map((e) => ({
        name: e.name,
        type: e.type,
        action: e.action
      }))
    },
    llmClient,
    llmConfig,
    stats
  );

  return memories;
}
