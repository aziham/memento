/**
 * Neo4j Node Operations
 *
 * CRUD operations for Entity, Memory, and Note nodes.
 * Uses runCommand for session lifecycle and query repository for Cypher.
 */

import type { Driver } from 'neo4j-driver';
import type {
  CreateEntityInput,
  CreateMemoryInput,
  CreateNoteInput,
  Entity,
  EntityUpdate,
  EntityWithDegree,
  Memory,
  MemoryUpdate,
  Note
} from '../../types';
import { GraphClientError } from '../../types';
import { generateId, now } from '../../utils';
import { runCommand } from '../errors';
import { recordToEntity, recordToMemory, recordToNote } from '../mapping';
import {
  CREATE_MEMORIES,
  CREATE_NOTES,
  DELETE_NODES,
  GET_ENTITIES_WITH_DEGREE,
  GET_ENTITY_BY_ID,
  GET_ENTITY_BY_NAME,
  GET_MEMORY_BY_ID,
  GET_NOTE_BY_ID,
  MERGE_ENTITIES
} from '../queries';

// ============================================================
// BULK CREATE OPERATIONS
// ============================================================

/**
 * Create or merge multiple entities.
 * Uses MERGE on name - existing entities are updated, new ones created.
 */
export async function createEntities(
  driver: Driver,
  database: string,
  entities: CreateEntityInput[]
): Promise<Entity[]> {
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

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      const result = await session.executeWrite(async (tx) => {
        return tx.run(MERGE_ENTITIES, { entities: entitiesWithIds });
      });
      return result.records.map((r) => recordToEntity(r.get('e')));
    },
    'createEntities'
  );
}

/**
 * Create multiple memories.
 * Always creates new nodes - memories are immutable facts with provenance.
 */
export async function createMemories(
  driver: Driver,
  database: string,
  memories: CreateMemoryInput[]
): Promise<Memory[]> {
  if (memories.length === 0) return [];

  const timestamp = now();
  const memoriesWithIds = memories.map((m) => ({
    ...m,
    id: generateId(),
    created_at: timestamp,
    embedding: m.embedding ?? null
  }));

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      const result = await session.executeWrite(async (tx) => {
        return tx.run(CREATE_MEMORIES, { memories: memoriesWithIds });
      });
      return result.records.map((r) => recordToMemory(r.get('m')));
    },
    'createMemories'
  );
}

/**
 * Create multiple notes.
 * Notes are immutable memorize() inputs - raw provenance data.
 */
export async function createNotes(
  driver: Driver,
  database: string,
  notes: CreateNoteInput[]
): Promise<Note[]> {
  if (notes.length === 0) return [];

  const notesWithIds = notes.map((n) => ({
    ...n,
    id: generateId()
  }));

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      const result = await session.executeWrite(async (tx) => {
        return tx.run(CREATE_NOTES, { notes: notesWithIds });
      });
      return result.records.map((r) => recordToNote(r.get('n')));
    },
    'createNotes'
  );
}

// ============================================================
// INDIVIDUAL LOOKUPS
// ============================================================

export async function getEntityById(
  driver: Driver,
  database: string,
  id: string
): Promise<Entity | null> {
  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GET_ENTITY_BY_ID, { id });
      const record = result.records[0];
      if (!record) return null;
      return recordToEntity(record.get('e'));
    },
    'getEntityById'
  );
}

export async function getEntityByName(
  driver: Driver,
  database: string,
  name: string
): Promise<Entity | null> {
  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GET_ENTITY_BY_NAME, { name });
      const record = result.records[0];
      if (!record) return null;
      return recordToEntity(record.get('e'));
    },
    'getEntityByName'
  );
}

/**
 * Get multiple entities by name with their degree (ABOUT relationship count).
 *
 * Used by ANCHOR phase for multi-signal entity weighting.
 * Degree represents structural importance in the knowledge graph.
 */
export async function getEntitiesWithDegree(
  driver: Driver,
  database: string,
  names: string[]
): Promise<EntityWithDegree[]> {
  if (names.length === 0) return [];

  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GET_ENTITIES_WITH_DEGREE, { names });
      return result.records.map((record) => ({
        entity: recordToEntity(record.get('e')),
        degree: record.get('degree').toNumber()
      }));
    },
    'getEntitiesWithDegree'
  );
}

export async function getMemoryById(
  driver: Driver,
  database: string,
  id: string
): Promise<Memory | null> {
  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GET_MEMORY_BY_ID, { id });
      const record = result.records[0];
      if (!record) return null;
      return recordToMemory(record.get('m'));
    },
    'getMemoryById'
  );
}

export async function getNoteById(
  driver: Driver,
  database: string,
  id: string
): Promise<Note | null> {
  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GET_NOTE_BY_ID, { id });
      const record = result.records[0];
      if (!record) return null;
      return recordToNote(record.get('n'));
    },
    'getNoteById'
  );
}

// ============================================================
// UPDATE OPERATIONS
// ============================================================

/**
 * Update a memory's properties.
 * Builds SET clause dynamically to only update provided fields.
 */
export async function updateMemory(
  driver: Driver,
  database: string,
  id: string,
  updates: MemoryUpdate
): Promise<Memory> {
  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      const normalizedUpdates = {
        ...updates,
        embedding: updates.embedding ?? undefined
      };

      // Build SET clause dynamically
      const setClauses: string[] = [];
      const params: Record<string, unknown> = { id };

      for (const [key, value] of Object.entries(normalizedUpdates)) {
        if (value !== undefined && key !== 'id') {
          setClauses.push(`m.${key} = $${key}`);
          params[key] = value;
        }
      }

      if (setClauses.length === 0) {
        const existing = await getMemoryById(driver, database, id);
        if (!existing) {
          throw new GraphClientError(`Memory not found: ${id}`, 'NOT_FOUND');
        }
        return existing;
      }

      const result = await session.executeWrite(async (tx) => {
        return tx.run(`MATCH (m:Memory {id: $id}) SET ${setClauses.join(', ')} RETURN m`, params);
      });

      const record = result.records[0];
      if (!record) {
        throw new GraphClientError(`Memory not found: ${id}`, 'NOT_FOUND');
      }

      return recordToMemory(record.get('m'));
    },
    'updateMemory'
  );
}

/**
 * Immutable entity fields that cannot be changed after creation.
 * - id: Primary key, never changes
 * - isWellKnown: First classification wins (see MERGE_ENTITIES query)
 */
const IMMUTABLE_ENTITY_FIELDS = new Set(['id', 'isWellKnown']);

/**
 * Update an entity's properties.
 * Builds SET clause dynamically to only update provided fields.
 *
 * Note: `isWellKnown` is immutable - first classification wins.
 * This matches the MERGE_ENTITIES query behavior where ON MATCH
 * does not update isWellKnown.
 */
export async function updateEntity(
  driver: Driver,
  database: string,
  id: string,
  updates: EntityUpdate
): Promise<Entity> {
  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      const normalizedUpdates = {
        ...updates,
        embedding: updates.embedding ?? undefined
      };

      // Build SET clause dynamically, excluding immutable fields
      const setClauses: string[] = [];
      const params: Record<string, unknown> = { id };

      for (const [key, value] of Object.entries(normalizedUpdates)) {
        if (value !== undefined && !IMMUTABLE_ENTITY_FIELDS.has(key)) {
          setClauses.push(`e.${key} = $${key}`);
          params[key] = value;
        }
      }

      if (setClauses.length === 0) {
        const existing = await getEntityById(driver, database, id);
        if (!existing) {
          throw new GraphClientError(`Entity not found: ${id}`, 'NOT_FOUND');
        }
        return existing;
      }

      const result = await session.executeWrite(async (tx) => {
        return tx.run(`MATCH (e:Entity {id: $id}) SET ${setClauses.join(', ')} RETURN e`, params);
      });

      const record = result.records[0];
      if (!record) {
        throw new GraphClientError(`Entity not found: ${id}`, 'NOT_FOUND');
      }

      return recordToEntity(record.get('e'));
    },
    'updateEntity'
  );
}

// ============================================================
// DELETE OPERATIONS
// ============================================================

/**
 * Delete nodes by their IDs.
 * Uses DETACH DELETE to remove nodes and all their relationships.
 */
export async function deleteNodes(driver: Driver, database: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      await session.executeWrite(async (tx) => {
        return tx.run(DELETE_NODES, { ids });
      });
    },
    'deleteNodes'
  );
}
