/**
 * Neo4j Edge Operations
 *
 * Relationship management for structural edges.
 * Uses runCommand for session lifecycle and query repository for Cypher.
 */

import type { Driver } from 'neo4j-driver';
import { generateId, now } from '../../utils';
import { runCommand } from '../errors';
import {
  CREATE_ABOUT_EDGE,
  CREATE_EXTRACTED_FROM_EDGE,
  CREATE_INVALIDATES_EDGE,
  CREATE_MENTIONS_EDGE
} from '../queries';

// ============================================================
// STRUCTURAL EDGE OPERATIONS
// ============================================================

/**
 * Create MENTIONS edge: Note -> Entity
 * Notes that an entity was mentioned in a memorize() input.
 */
export async function createMentionsEdge(
  driver: Driver,
  database: string,
  noteId: string,
  entityId: string
): Promise<string> {
  const edgeId = generateId();
  const timestamp = now();

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      await session.executeWrite(async (tx) => {
        return tx.run(CREATE_MENTIONS_EDGE, { noteId, entityId, edgeId, timestamp });
      });
      return edgeId;
    },
    'createMentionsEdge'
  );
}

/**
 * Create EXTRACTED_FROM edge: Memory -> Note
 * Links a memory to its source memorize() input (provenance).
 */
export async function createExtractedFromEdge(
  driver: Driver,
  database: string,
  memoryId: string,
  noteId: string
): Promise<string> {
  const edgeId = generateId();
  const timestamp = now();

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      await session.executeWrite(async (tx) => {
        return tx.run(CREATE_EXTRACTED_FROM_EDGE, { memoryId, noteId, edgeId, timestamp });
      });
      return edgeId;
    },
    'createExtractedFromEdge'
  );
}

/**
 * Create INVALIDATES edge: Memory -> Memory
 * Records that a newer memory supersedes an older one.
 */
export async function createInvalidatesEdge(
  driver: Driver,
  database: string,
  newMemoryId: string,
  oldMemoryId: string,
  reason: string
): Promise<string> {
  const edgeId = generateId();
  const timestamp = now();

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      await session.executeWrite(async (tx) => {
        return tx.run(CREATE_INVALIDATES_EDGE, {
          newMemoryId,
          oldMemoryId,
          edgeId,
          timestamp,
          reason
        });
      });
      return edgeId;
    },
    'createInvalidatesEdge'
  );
}

/**
 * Create ABOUT edge: Memory -> Entity
 * Links a memory to the entity it describes.
 */
export async function createAboutEdge(
  driver: Driver,
  database: string,
  memoryId: string,
  entityId: string
): Promise<string> {
  const edgeId = generateId();
  const timestamp = now();

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      await session.executeWrite(async (tx) => {
        return tx.run(CREATE_ABOUT_EDGE, { memoryId, entityId, edgeId, timestamp });
      });
      return edgeId;
    },
    'createAboutEdge'
  );
}
