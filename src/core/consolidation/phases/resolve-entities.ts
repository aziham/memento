/**
 * Resolve Entities Phase
 *
 * Third phase of the consolidation pipeline.
 * Calls the entity-resolver agent and builds EntityDecision objects.
 *
 * Input: Extracted entities + search results + user context
 * Output: Entity decisions with embeddings attached
 */

import type { GraphClient } from '@/providers/graph/types';
import type { LLMClient } from '@/providers/llm/types';
import {
  type EntityToResolve,
  resolveEntities as resolveEntitiesAgent
} from '../agents/entity-resolver';
import type { EntityDecision, ExtractedEntity, UserDescriptionUpdate } from '../schemas';
import type { EntitySearchWithEmbedding, LLMConfig, PipelineStats } from '../types';
import { assertDefined, callAgent } from '../utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ResolveEntitiesInput {
  extractedEntities: ExtractedEntity[];
  searchResults: EntitySearchWithEmbedding[];
  userBiographicalFacts: string | null;
  graphClient: GraphClient;
}

export interface ResolveEntitiesOutput {
  entities: EntityDecision[];
  userDescriptionUpdate: UserDescriptionUpdate | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve extracted entities against existing graph entities.
 *
 * 1. Get current user description if biographical facts were extracted
 * 2. Build input for entity-resolver agent
 * 3. Call entity-resolver agent
 * 4. Build EntityDecision objects with embeddings attached
 *
 * @param input - Extracted entities, search results, and user context
 * @param llmClient - LLM client for agent call
 * @param llmConfig - LLM configuration
 * @param stats - Pipeline stats to update
 * @returns Entity decisions with embeddings + user description update
 */
export async function resolveEntities(
  input: ResolveEntitiesInput,
  llmClient: LLMClient,
  llmConfig: LLMConfig,
  stats: PipelineStats
): Promise<ResolveEntitiesOutput> {
  const { extractedEntities, searchResults, userBiographicalFacts, graphClient } = input;

  // If no entities and no biographical facts, nothing to resolve
  if (extractedEntities.length === 0 && !userBiographicalFacts) {
    return { entities: [], userDescriptionUpdate: null };
  }

  // Get current user description for comparison (if biographical facts were extracted)
  let currentUserDescription: string | null = null;
  if (userBiographicalFacts) {
    const user = await graphClient.getUser();
    currentUserDescription = user?.description ?? null;
  }

  // Build entities to resolve
  const entitiesToResolve: EntityToResolve[] = extractedEntities.map((entity, i) => {
    const result = assertDefined(searchResults[i], `Missing search result for entity ${i}`);
    return {
      entityName: entity.name,
      entityType: entity.type,
      entityDescription: entity.description,
      entityIsWellKnown: entity.isWellKnown,
      queryEmbedding: result.queryEmbedding,
      searchResults: result.results
    };
  });

  // Call the entity-resolver agent
  const resolveResult = await callAgent(
    resolveEntitiesAgent,
    {
      entities: entitiesToResolve,
      userBiographicalFacts,
      currentUserDescription
    },
    llmClient,
    llmConfig,
    stats
  );

  // Validate LLM output alignment - must have same number of decisions as entities
  if (resolveResult.entities.length !== extractedEntities.length) {
    throw new Error(
      `LLM returned ${resolveResult.entities.length} entity decisions but expected ${extractedEntities.length}. ` +
        'The agent must return exactly one decision per input entity in the same order.'
    );
  }

  // Build a map for case-insensitive entity lookup (handles LLM casing inconsistencies)
  // If multiple entities have the same lowercase name, the last one wins - but this is
  // unlikely since entity extraction typically deduplicates
  const entityByNameLower = new Map<string, EntityToResolve>();
  for (const entity of entitiesToResolve) {
    entityByNameLower.set(entity.entityName.toLowerCase(), entity);
  }

  // Validate all returned entity names exist in input
  for (const decision of resolveResult.entities) {
    if (!entityByNameLower.has(decision.entityName.toLowerCase())) {
      throw new Error(
        `LLM returned decision for unknown entity "${decision.entityName}". ` +
          `Expected one of: ${entitiesToResolve.map((e) => e.entityName).join(', ')}`
      );
    }
  }

  // Build EntityDecision objects with embeddings attached
  const resolvedEntities: EntityDecision[] = [];
  for (const decision of resolveResult.entities) {
    const entityData = entityByNameLower.get(decision.entityName.toLowerCase());
    const matchedResult = entityData?.searchResults.find((r) => r.id === decision.matchedEntityId);

    resolvedEntities.push({
      action: decision.action,
      name: decision.entityName,
      type: decision.entityType,
      description: entityData?.entityDescription ?? '',
      matchedEntityId: decision.matchedEntityId,
      similarity: matchedResult?.similarity,
      // Include embedding for CREATE entities (reused from search phase)
      // Also include for MATCH entities that need description update (for re-embedding)
      embedding:
        decision.action === 'CREATE' || decision.updateDescription
          ? entityData?.queryEmbedding
          : undefined,
      updateDescription: decision.updateDescription,
      // Only include isWellKnown for CREATE entities (first classification wins, immutable)
      // For MATCH entities, the existing value in the database is preserved
      isWellKnown: decision.action === 'CREATE' ? entityData?.entityIsWellKnown : undefined,
      reason: decision.reason
    });
  }

  return {
    entities: resolvedEntities,
    userDescriptionUpdate: resolveResult.userDescriptionUpdate
  };
}
