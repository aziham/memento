/**
 * Neo4j Transaction Operations
 *
 * Provides transaction-scoped versions of write operations.
 * These run within an existing transaction context rather than
 * creating their own sessions.
 */

import type { ManagedTransaction } from 'neo4j-driver';
import type {
  CreateEntityInput,
  CreateMemoryInput,
  CreateNoteInput,
  CreateUserInput,
  Entity,
  EntityUpdate,
  Memory,
  MemoryUpdate,
  Note,
  TransactionClient,
  User
} from '../../types';
import { GraphClientError } from '../../types';
import { generateId, now } from '../../utils';
import { recordToEntity, recordToMemory, recordToNote, recordToUser } from '../mapping';
import {
  CREATE_ABOUT_EDGE,
  CREATE_ABOUT_USER_EDGE,
  CREATE_EXTRACTED_FROM_EDGE,
  CREATE_INVALIDATES_EDGE,
  CREATE_MEMORIES,
  CREATE_MENTIONS_EDGE,
  CREATE_NOTES,
  GET_OR_CREATE_USER,
  MERGE_ENTITIES,
  UPDATE_USER
} from '../queries';

// ============================================================
// TRANSACTION CLIENT IMPLEMENTATION
// ============================================================

/**
 * Creates a TransactionClient that executes operations within
 * the provided Neo4j managed transaction.
 */
export function createTransactionClient(tx: ManagedTransaction): TransactionClient {
  return {
    // --------------------------------------------------------
    // NODE CREATION
    // --------------------------------------------------------

    async createEntities(entities: CreateEntityInput[]): Promise<Entity[]> {
      if (entities.length === 0) return [];

      const timestamp = now();
      const entitiesWithIds = entities.map((e) => ({
        ...e,
        id: generateId(),
        created_at: timestamp,
        updated_at: timestamp,
        description: e.description ?? null,
        embedding: e.embedding ?? null
      }));

      const result = await tx.run(MERGE_ENTITIES, { entities: entitiesWithIds });
      return result.records.map((r) => recordToEntity(r.get('e')));
    },

    async createMemories(memories: CreateMemoryInput[]): Promise<Memory[]> {
      if (memories.length === 0) return [];

      const timestamp = now();
      const memoriesWithIds = memories.map((m) => ({
        ...m,
        id: generateId(),
        created_at: timestamp,
        embedding: m.embedding ?? null
      }));

      const result = await tx.run(CREATE_MEMORIES, { memories: memoriesWithIds });
      return result.records.map((r) => recordToMemory(r.get('m')));
    },

    async createNotes(notes: CreateNoteInput[]): Promise<Note[]> {
      if (notes.length === 0) return [];

      const notesWithIds = notes.map((n) => ({
        ...n,
        id: generateId()
      }));

      const result = await tx.run(CREATE_NOTES, { notes: notesWithIds });
      return result.records.map((r) => recordToNote(r.get('n')));
    },

    // --------------------------------------------------------
    // USER OPERATIONS
    // --------------------------------------------------------

    async getOrCreateUser(defaults: CreateUserInput): Promise<User> {
      const timestamp = now();
      const result = await tx.run(GET_OR_CREATE_USER, {
        name: defaults.name,
        description: defaults.description ?? null,
        embedding: defaults.embedding,
        created_at: timestamp,
        updated_at: timestamp
      });

      const record = result.records[0];
      if (!record) {
        throw new GraphClientError('Failed to get or create User', 'QUERY_ERROR');
      }

      return recordToUser(record.get('u'));
    },

    async updateUser(
      updates: Partial<Pick<User, 'name' | 'description' | 'embedding'>>
    ): Promise<User> {
      const timestamp = now();

      // Filter out undefined values to avoid setting properties to null
      const updateParams: Record<string, unknown> = {};
      if (updates.name !== undefined) updateParams['name'] = updates.name;
      if (updates.description !== undefined) updateParams['description'] = updates.description;
      if (updates.embedding !== undefined) updateParams['embedding'] = updates.embedding;

      const result = await tx.run(UPDATE_USER, {
        updates: updateParams,
        updated_at: timestamp
      });

      const record = result.records[0];
      if (!record) {
        throw new GraphClientError('User not found', 'NOT_FOUND');
      }

      return recordToUser(record.get('u'));
    },

    // --------------------------------------------------------
    // NODE UPDATES
    // --------------------------------------------------------

    async updateMemory(id: string, updates: MemoryUpdate): Promise<Memory> {
      const normalizedUpdates = {
        ...updates,
        embedding: updates.embedding ?? undefined
      };

      const setClauses: string[] = [];
      const params: Record<string, unknown> = { id };

      for (const [key, value] of Object.entries(normalizedUpdates)) {
        if (value !== undefined && key !== 'id') {
          setClauses.push(`m.${key} = $${key}`);
          params[key] = value;
        }
      }

      if (setClauses.length === 0) {
        // No updates, fetch and return existing
        const result = await tx.run('MATCH (m:Memory {id: $id}) RETURN m', { id });
        const record = result.records[0];
        if (!record) {
          throw new GraphClientError(`Memory not found: ${id}`, 'NOT_FOUND');
        }
        return recordToMemory(record.get('m'));
      }

      const result = await tx.run(
        `MATCH (m:Memory {id: $id}) SET ${setClauses.join(', ')} RETURN m`,
        params
      );

      const record = result.records[0];
      if (!record) {
        throw new GraphClientError(`Memory not found: ${id}`, 'NOT_FOUND');
      }

      return recordToMemory(record.get('m'));
    },

    async updateEntity(id: string, updates: EntityUpdate): Promise<Entity> {
      const normalizedUpdates = {
        ...updates,
        embedding: updates.embedding ?? undefined
      };

      const setClauses: string[] = [];
      const params: Record<string, unknown> = { id };

      for (const [key, value] of Object.entries(normalizedUpdates)) {
        if (value !== undefined && key !== 'id') {
          setClauses.push(`e.${key} = $${key}`);
          params[key] = value;
        }
      }

      if (setClauses.length === 0) {
        // No updates, fetch and return existing
        const result = await tx.run('MATCH (e:Entity {id: $id}) RETURN e', { id });
        const record = result.records[0];
        if (!record) {
          throw new GraphClientError(`Entity not found: ${id}`, 'NOT_FOUND');
        }
        return recordToEntity(record.get('e'));
      }

      const result = await tx.run(
        `MATCH (e:Entity {id: $id}) SET ${setClauses.join(', ')} RETURN e`,
        params
      );

      const record = result.records[0];
      if (!record) {
        throw new GraphClientError(`Entity not found: ${id}`, 'NOT_FOUND');
      }

      return recordToEntity(record.get('e'));
    },

    // --------------------------------------------------------
    // EDGE CREATION
    // --------------------------------------------------------

    async createMentionsEdge(noteId: string, entityId: string): Promise<string> {
      const edgeId = generateId();
      const timestamp = now();
      await tx.run(CREATE_MENTIONS_EDGE, { noteId, entityId, edgeId, timestamp });
      return edgeId;
    },

    async createExtractedFromEdge(memoryId: string, noteId: string): Promise<string> {
      const edgeId = generateId();
      const timestamp = now();
      await tx.run(CREATE_EXTRACTED_FROM_EDGE, { memoryId, noteId, edgeId, timestamp });
      return edgeId;
    },

    async createInvalidatesEdge(
      newMemoryId: string,
      oldMemoryId: string,
      reason: string
    ): Promise<string> {
      const edgeId = generateId();
      const timestamp = now();
      await tx.run(CREATE_INVALIDATES_EDGE, {
        newMemoryId,
        oldMemoryId,
        edgeId,
        timestamp,
        reason
      });
      return edgeId;
    },

    async createAboutEdge(memoryId: string, entityId: string): Promise<string> {
      const edgeId = generateId();
      const timestamp = now();
      await tx.run(CREATE_ABOUT_EDGE, { memoryId, entityId, edgeId, timestamp });
      return edgeId;
    },

    async createAboutUserEdge(memoryId: string): Promise<string> {
      const edgeId = generateId();
      const timestamp = now();
      const result = await tx.run(CREATE_ABOUT_USER_EDGE, {
        memoryId,
        edgeId,
        created_at: timestamp
      });
      const record = result.records[0];
      return record ? (record.get('id') as string) : edgeId;
    }
  };
}
