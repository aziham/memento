/**
 * TRACE Phase - Build rich output with graph context
 *
 * Fifth and final phase of the retrieval pipeline. Builds the rich
 * RetrievalOutput with entity details, invalidation chains, and provenance.
 */

import type { GraphClient } from '@/providers/graph/types';
import type {
  EntityData,
  InvalidatedMemory,
  MemoryData,
  RetrievalOutput,
  ScoredMemory,
  WeightedEntity
} from '../types';
import { normalizeContent } from '../utils';

/**
 * Execute the TRACE phase.
 *
 * Builds the rich RetrievalOutput with full graph context:
 * 1. Entity details for all entities mentioned in memories
 * 2. Invalidation chains (2 hops) with reasons
 * 3. Provenance (source Note) for each memory
 * 4. User node for name resolution
 *
 * @param graphClient - Graph client for database operations
 * @param query - Original query string
 * @param memories - Scored memories from DISTILL phase
 * @param anchorEntities - Anchor entities from ANCHOR phase
 * @param totalCandidates - Total candidates considered
 * @param durationMs - Time taken in milliseconds
 * @returns Rich retrieval output
 */
export async function trace(
  graphClient: GraphClient,
  query: string,
  memories: ScoredMemory[],
  anchorEntities: WeightedEntity[],
  totalCandidates: number,
  durationMs: number
): Promise<RetrievalOutput> {
  if (memories.length === 0) {
    return {
      query,
      entities: [],
      memories: [],
      meta: { totalCandidates, durationMs }
    };
  }

  const memoryIds = memories.map((m) => m.result.id);

  // Fetch all additional data in parallel
  const [aboutMap, invalidatesMap, provenanceMap, user] = await Promise.all([
    graphClient.getMemoryAboutEntities(memoryIds),
    graphClient.getMemoryInvalidates(memoryIds),
    graphClient.getMemoryProvenance(memoryIds),
    graphClient.getUser()
  ]);

  // Collect all unique entity names from memories
  const allEntityNames = new Set<string>();
  for (const names of aboutMap.values()) {
    for (const name of names) {
      allEntityNames.add(name);
    }
  }

  // Also add anchor entity names (they might not be in aboutMap if no memories reference them)
  for (const anchor of anchorEntities) {
    allEntityNames.add(anchor.entity.name);
  }

  // Fetch full entity details
  const entityDataMap = await graphClient.getEntitiesByName(Array.from(allEntityNames));

  // Get user's actual name for display
  const userName = user?.name ?? 'User';

  // Count how many memories reference each entity
  const entityMemoryCount = new Map<string, number>();
  for (const names of aboutMap.values()) {
    for (const name of names) {
      entityMemoryCount.set(name, (entityMemoryCount.get(name) ?? 0) + 1);
    }
  }

  // Build EntityData array - only include entities referenced by at least one memory
  const entities: EntityData[] = [];
  for (const name of allEntityNames) {
    const memoryCount = entityMemoryCount.get(name) ?? 0;
    if (memoryCount === 0) continue; // Skip entities not referenced by any memory

    const entityData = entityDataMap.get(name);
    if (entityData) {
      entities.push({
        id: entityData.id,
        name: entityData.isUser ? userName : entityData.name,
        type: entityData.isUser ? 'User' : entityData.type,
        description: entityData.description,
        isWellKnown: entityData.isUser ? false : entityData.isWellKnown, // User is never well-known
        isUser: entityData.isUser,
        memoryCount
      });
    }
  }

  // Sort entities: User first, then by memoryCount descending
  entities.sort((a, b) => {
    if (a.isUser && !b.isUser) return -1;
    if (!a.isUser && b.isUser) return 1;
    return b.memoryCount - a.memoryCount;
  });

  // Build MemoryData array
  const memoryResults: MemoryData[] = memories.map((m, index) => {
    const aboutNames = aboutMap.get(m.result.id) ?? [];
    const invalidates = invalidatesMap.get(m.result.id);
    const provenance = provenanceMap.get(m.result.id);

    // Map entity names to display names (use user's actual name)
    const aboutDisplayNames = aboutNames.map((name) => {
      const entityData = entityDataMap.get(name);
      return entityData?.isUser ? userName : name;
    });

    // Map entity names to IDs
    const aboutEntityIds = aboutNames.map((name) => {
      const entityData = entityDataMap.get(name);
      return entityData?.id ?? name;
    });

    // Convert invalidates to InvalidatedMemory format
    let invalidatedMemories: InvalidatedMemory[] | undefined;
    if (invalidates && invalidates.length > 0) {
      invalidatedMemories = invalidates.map((invalidation) => ({
        id: invalidation.id,
        content: normalizeContent(invalidation.content),
        validAt: invalidation.validAt,
        invalidatedAt: invalidation.invalidatedAt,
        reason: invalidation.reason,
        invalidated: invalidation.invalidated?.map((hop2) => ({
          ...hop2,
          content: normalizeContent(hop2.content)
        }))
      }));
    }

    return {
      rank: index + 1,
      id: m.result.id,
      content: normalizeContent(m.result.content),
      score: m.score,
      source: m.source,
      about: aboutDisplayNames,
      aboutEntityIds,
      validAt: m.result.valid_at,
      invalidates: invalidatedMemories,
      extractedFrom: provenance
        ? {
            noteId: provenance.noteId,
            noteContent: normalizeContent(provenance.noteContent),
            noteTimestamp: provenance.noteTimestamp
          }
        : undefined
    };
  });

  return {
    query,
    entities,
    memories: memoryResults,
    meta: { totalCandidates, durationMs }
  };
}
