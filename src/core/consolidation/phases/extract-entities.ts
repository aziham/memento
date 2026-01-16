/**
 * Extract Entities Phase
 *
 * First phase of the consolidation pipeline.
 * Calls the entity-extractor agent and normalizes entity names.
 *
 * Input: Note content + optional user name
 * Output: Extracted entities + user biographical facts
 */

import type { LLMClient } from '@/providers/llm/types';
import { extractEntities as extractEntitiesAgent } from '../agents/entity-extractor';
import type { ExtractedEntity } from '../schemas';
import type { LLMConfig, PipelineStats } from '../types';
import { callAgent, normalizeEntityName } from '../utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExtractEntitiesInput {
  noteContent: string;
  userName: string | null;
}

export interface ExtractEntitiesOutput {
  entities: ExtractedEntity[];
  userBiographicalFacts: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract entities from note content.
 *
 * 1. Call entity-extractor agent
 * 2. Normalize entity names to Title Case
 *
 * @param input - Note content and optional user name
 * @param llmClient - LLM client for agent call
 * @param llmConfig - LLM configuration
 * @param stats - Pipeline stats to update
 * @returns Extracted entities with normalized names + user biographical facts
 */
export async function extractEntities(
  input: ExtractEntitiesInput,
  llmClient: LLMClient,
  llmConfig: LLMConfig,
  stats: PipelineStats
): Promise<ExtractEntitiesOutput> {
  // Call the entity-extractor agent
  const result = await callAgent(
    extractEntitiesAgent,
    {
      noteContent: input.noteContent,
      userName: input.userName ?? undefined
    },
    llmClient,
    llmConfig,
    stats
  );

  // Normalize entity names to Title Case for consistency
  // e.g., "machine learning" -> "Machine Learning"
  const normalizedEntities = result.entities.map((e) => ({
    name: normalizeEntityName(e.name),
    type: e.type,
    description: e.description,
    isWellKnown: e.isWellKnown
  }));

  return {
    entities: normalizedEntities,
    userBiographicalFacts: result.userBiographicalFacts
  };
}
