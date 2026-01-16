/**
 * Write Graph Phase
 *
 * Final phase of the consolidation pipeline.
 * Atomic transaction to write consolidation results to the knowledge graph.
 *
 * Responsibilities:
 * - Embed memory contents for ADD/INVALIDATE memories (moved from search phase)
 * - Uses pre-computed embeddings from entity search phase
 * - Only updates User node when the detected name differs from existing
 * - Handles entity description updates for MATCH entities
 * - Handles User description updates when biographical facts are extracted
 */

import type { EmbeddingClient } from '@/providers/embedding/types';
import type { CreateEntityInput, CreateMemoryInput, GraphClient } from '@/providers/graph/types';
import type {
  ConsolidationInput,
  EntityDecision,
  MemoryDecision,
  UserDescriptionUpdate
} from '../schemas';
import { assertDefined } from '../utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface WriteGraphInput {
  noteInput: ConsolidationInput;
  entities: EntityDecision[];
  memories: MemoryDecision[];
  userDescriptionUpdate: UserDescriptionUpdate | null;
}

export interface WriteGraphDependencies {
  graphClient: GraphClient;
  embeddingClient: EmbeddingClient;
  userName: string | null;
}

export interface WriteGraphOutput {
  noteId: string | null;
  entityIds: Map<string, string>;
  memoryIds: string[];
  skipped: boolean;
  skipReason?: string;
  userDescriptionUpdated: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract user's first name from a memory content if it contains a name declaration.
 * Patterns matched:
 * - "USER's name is X" → extracts first name only
 * - "USER's full name is X Y Z" → extracts first name only
 * - "USER is called X"
 *
 * Supports Unicode characters, hyphens, apostrophes (e.g., "Jean-Pierre", "O'Connor", "André").
 * The full name is preserved in the memory content; only the first name is used for the User node.
 */
function extractUserName(content: string): string | null {
  // Pattern: "USER's name is X" or "USER's full name is X Y Z" - extract first name only
  // Supports Unicode letters, hyphens, apostrophes: Jean-Pierre, O'Connor, André
  const nameIsMatch = content.match(
    /USER'?s?\s+(?:full\s+)?name\s+is\s+([\p{L}\p{M}][\p{L}\p{M}'-]*)/iu
  );
  if (nameIsMatch?.[1]) return nameIsMatch[1].trim();

  // Pattern: "USER is called X"
  const calledMatch = content.match(/USER\s+is\s+called\s+([\p{L}\p{M}][\p{L}\p{M}'-]*)/iu);
  if (calledMatch?.[1]) return calledMatch[1].trim();

  return null;
}

/**
 * Check if an entity name matches the user's name (case-insensitive).
 */
function isUserName(entityName: string, userName: string | null): boolean {
  if (!userName || userName.toLowerCase() === 'user') {
    return false;
  }
  return entityName.toLowerCase() === userName.toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Write consolidation results to the knowledge graph.
 *
 * 1. Filter entities matching user's name
 * 2. Check if note should be skipped
 * 3. Pre-generate embeddings for User node if needed
 * 4. Execute atomic transaction to write all data
 *
 * @param input - Note input, entities, memories, user description update
 * @param deps - Graph client, embedding client, user name
 * @returns Write result with IDs and skip status
 */
export async function writeGraph(
  input: WriteGraphInput,
  deps: WriteGraphDependencies
): Promise<WriteGraphOutput> {
  const { noteInput, entities, memories, userDescriptionUpdate } = input;
  const { graphClient, embeddingClient, userName } = deps;

  // Defensive filter: Remove any entities that match the user's name
  // This handles cases where the LLM still extracts the user's name despite instructions
  const filteredEntities = entities.filter((e) => !isUserName(e.name, userName));

  // Check if note should be skipped
  const nonSkippedMemories = memories.filter((d) => d.action !== 'SKIP');
  const hasNoMemories = memories.length === 0;
  const allMemoriesSkipped = memories.length > 0 && nonSkippedMemories.length === 0;

  // Skip if no memories extracted or all memories were duplicates
  if (hasNoMemories) {
    return {
      noteId: null,
      entityIds: new Map(),
      memoryIds: [],
      skipped: true,
      skipReason: 'No memories could be extracted from this note',
      userDescriptionUpdated: false
    };
  }

  if (allMemoriesSkipped) {
    return {
      noteId: null,
      entityIds: new Map(),
      memoryIds: [],
      skipped: true,
      skipReason: 'All memories were duplicates of existing knowledge',
      userDescriptionUpdated: false
    };
  }

  // Check if any memories are about USER - if so, we'll need to ensure User node exists
  const userMemories = nonSkippedMemories.filter((d) => d.aboutEntities.includes('USER'));
  const hasUserMemories = userMemories.length > 0;

  // Check if any memory contains the user's name (for updating User node)
  let detectedUserName: string | null = userName;
  for (const memory of userMemories) {
    const name = extractUserName(memory.content);
    if (name) {
      detectedUserName = name;
      break;
    }
  }

  // Pre-generate User embedding if needed (outside transaction for efficiency)
  // Use detected name if available, otherwise 'user'
  let userEmbedding: number[] | null = null;
  if (hasUserMemories) {
    userEmbedding = await embeddingClient.embed(detectedUserName || 'user');
  }

  // Pre-generate User description embedding if update is needed (outside transaction)
  let userDescriptionEmbedding: number[] | null = null;
  const shouldUpdateUserDescription =
    userDescriptionUpdate?.shouldUpdate && userDescriptionUpdate?.newDescription;
  if (shouldUpdateUserDescription) {
    // Embed "UserName: Description" for semantic search
    const userNameForEmbed = detectedUserName || userName || 'User';
    userDescriptionEmbedding = await embeddingClient.embed(
      `${userNameForEmbed}: ${userDescriptionUpdate?.newDescription}`
    );
  }

  // Pre-generate memory embeddings for ADD/INVALIDATE memories (outside transaction)
  // This was moved from search-memories phase since we now use retrieval pipeline
  // Use a Map to avoid mutating input objects
  const memoryEmbeddingsMap = new Map<string, number[]>();
  const memoriesNeedingEmbeddings = nonSkippedMemories.filter((m) => !m.embedding);
  if (memoriesNeedingEmbeddings.length > 0) {
    const memoryContents = memoriesNeedingEmbeddings.map((m) => m.content);
    const memoryEmbeddings = await embeddingClient.embedBatch(memoryContents);

    // Store embeddings in map (keyed by content to avoid mutation)
    memoriesNeedingEmbeddings.forEach((m, i) => {
      const embedding = memoryEmbeddings[i];
      if (embedding) {
        memoryEmbeddingsMap.set(m.content, embedding);
      }
    });
  }

  return graphClient.executeTransaction(async (tx) => {
    let userDescriptionUpdated = false;

    // Ensure User node exists if we have memories about USER
    if (hasUserMemories && userEmbedding) {
      const existingUser = await tx.getOrCreateUser({
        name: detectedUserName || 'user',
        type: 'Person', // User is always a Person
        description: null,
        embedding: userEmbedding,
        isWellKnown: false // User is never well-known
      });

      // Only update if we detected a name that differs from existing (case-insensitive)
      if (detectedUserName && existingUser.name.toLowerCase() !== detectedUserName.toLowerCase()) {
        await tx.updateUser({ name: detectedUserName, embedding: userEmbedding });
      }
    }

    // Update User description if biographical facts were extracted and update is warranted
    if (shouldUpdateUserDescription && userDescriptionEmbedding) {
      await tx.updateUser({
        description: userDescriptionUpdate!.newDescription,
        embedding: userDescriptionEmbedding
      });
      userDescriptionUpdated = true;
    }

    // Create Note
    const notes = await tx.createNotes([
      { content: noteInput.content, timestamp: noteInput.timestamp }
    ]);
    const note = notes[0];
    if (!note) throw new Error('Failed to create note');

    // Create/merge Entities (using filtered list)
    const entityIds = new Map<string, string>();
    const entitiesToCreate = filteredEntities.filter((d) => d.action === 'CREATE');
    const entitiesToMatch = filteredEntities.filter((d) => d.action === 'MATCH');

    // Handle MATCH entities - store their IDs and update descriptions if needed
    for (const d of entitiesToMatch) {
      if (d.matchedEntityId) {
        entityIds.set(d.name, d.matchedEntityId);

        // Update description if flagged (embedding is pre-computed in pipeline)
        if (d.updateDescription && d.description && d.embedding) {
          await tx.updateEntity(d.matchedEntityId, {
            description: d.description,
            embedding: d.embedding
          });
        }
      }
    }

    if (entitiesToCreate.length > 0) {
      // Use pre-computed embeddings from search phase (no additional API calls)
      const inputs: CreateEntityInput[] = entitiesToCreate.map((d) => {
        if (!d.embedding) {
          throw new Error(`Missing embedding for CREATE entity: ${d.name}`);
        }
        if (d.isWellKnown === undefined) {
          throw new Error(`Missing isWellKnown for CREATE entity: ${d.name}`);
        }
        return {
          name: d.name,
          type: d.type,
          description: d.description,
          embedding: d.embedding,
          isWellKnown: d.isWellKnown
        };
      });
      const created = await tx.createEntities(inputs);
      created.forEach((entity, i) => {
        const entityDecision = assertDefined(
          entitiesToCreate[i],
          `Missing entity decision for index ${i}`
        );
        if (entity) entityIds.set(entityDecision.name, entity.id);
      });
    }

    // Create Memories (only for ADD, INVALIDATE)
    const memoriesToCreate = nonSkippedMemories;
    const memoryIds: string[] = [];

    if (memoriesToCreate.length > 0) {
      // Embeddings were pre-computed above (outside transaction) or provided in input
      const inputs: CreateMemoryInput[] = memoriesToCreate.map((d) => {
        // Use pre-existing embedding or look up from map
        const embedding = d.embedding ?? memoryEmbeddingsMap.get(d.content);
        if (!embedding) {
          throw new Error(
            `Missing embedding for ${d.action} memory: ${d.content.substring(0, 50)}...`
          );
        }
        return {
          content: d.content,
          embedding,
          valid_at: d.validAt || noteInput.timestamp,
          invalid_at: null
        };
      });
      const created = await tx.createMemories(inputs);
      memoryIds.push(...created.map((m) => m.id));
    }

    // Create edges
    for (let i = 0; i < memoriesToCreate.length; i++) {
      const decision = assertDefined(memoriesToCreate[i], `Missing memory decision for index ${i}`);
      const memoryId = assertDefined(memoryIds[i], `Missing memory ID for index ${i}`);

      // ABOUT edges - create one for each entity the memory is about
      for (const entity of decision.aboutEntities) {
        if (entity === 'USER') {
          await tx.createAboutUserEdge(memoryId);
        } else {
          const entityId = entityIds.get(entity);
          if (entityId) await tx.createAboutEdge(memoryId, entityId);
        }
      }

      // EXTRACTED_FROM edge
      await tx.createExtractedFromEdge(memoryId, note.id);

      // INVALIDATES edges - create one for EACH memory being invalidated
      if (decision.action === 'INVALIDATE' && decision.invalidates) {
        for (const invalidation of decision.invalidates) {
          await tx.createInvalidatesEdge(
            memoryId,
            invalidation.existingMemoryId,
            invalidation.reason
          );
          await tx.updateMemory(invalidation.existingMemoryId, {
            invalid_at: decision.validAt || noteInput.timestamp
          });
        }
      }
    }

    // MENTIONS edges (using filtered entities)
    const mentionedEntityIds = new Set(
      filteredEntities.map((d) => entityIds.get(d.name)).filter(Boolean) as string[]
    );
    for (const entityId of mentionedEntityIds) {
      await tx.createMentionsEdge(note.id, entityId);
    }

    return {
      noteId: note.id,
      entityIds,
      memoryIds,
      skipped: false,
      userDescriptionUpdated
    };
  });
}
