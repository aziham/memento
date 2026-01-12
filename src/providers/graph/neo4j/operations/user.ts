/**
 * Neo4j User Operations
 *
 * CRUD operations for the User node (singleton).
 * The User node represents "the person talking to the AI".
 * User is a special Entity with a fixed id of 'USER'.
 * Uses runCommand for session lifecycle and query repository for Cypher.
 */

import type { Driver } from 'neo4j-driver';
import type { CreateUserInput, User } from '../../types';
import { GraphClientError } from '../../types';
import { generateId, now } from '../../utils';
import { runCommand } from '../errors';
import { recordToUser } from '../mapping';
import {
  CREATE_ABOUT_USER_EDGE,
  CREATE_USER,
  GET_OR_CREATE_USER,
  GET_USER,
  UPDATE_USER
} from '../queries';

// ============================================================
// USER OPERATIONS
// ============================================================

/**
 * Get the User node.
 * Returns null if the User hasn't been created yet (memento init not run).
 */
export async function getUser(driver: Driver, database: string): Promise<User | null> {
  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GET_USER);
      const record = result.records[0];
      if (!record) return null;
      return recordToUser(record.get('u'));
    },
    'getUser'
  );
}

/**
 * Create the User node.
 * Should only be called once during `memento init`.
 */
export async function createUser(
  driver: Driver,
  database: string,
  input: CreateUserInput
): Promise<User> {
  const timestamp = now();

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      const result = await session.executeWrite(async (tx) => {
        return tx.run(CREATE_USER, {
          name: input.name,
          description: input.description,
          embedding: input.embedding,
          created_at: timestamp,
          updated_at: timestamp
        });
      });

      const record = result.records[0];
      if (!record) {
        throw new GraphClientError('Failed to create User', 'QUERY_ERROR');
      }
      return recordToUser(record.get('u'));
    },
    'createUser'
  );
}

/**
 * Update the User node.
 */
export async function updateUser(
  driver: Driver,
  database: string,
  updates: Partial<Pick<User, 'name' | 'description' | 'embedding'>>
): Promise<User> {
  const timestamp = now();

  const updateParams: Record<string, unknown> = {};
  if (updates.name !== undefined) updateParams['name'] = updates.name;
  if (updates.description !== undefined) updateParams['description'] = updates.description;
  if (updates.embedding !== undefined) updateParams['embedding'] = updates.embedding;

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      const result = await session.executeWrite(async (tx) => {
        return tx.run(UPDATE_USER, {
          updates: updateParams,
          updated_at: timestamp
        });
      });

      const record = result.records[0];
      if (!record) {
        throw new GraphClientError('User not found', 'NOT_FOUND');
      }
      return recordToUser(record.get('u'));
    },
    'updateUser'
  );
}

/**
 * Get or create the User node (MERGE semantics).
 * Useful for idempotent initialization.
 */
export async function getOrCreateUser(
  driver: Driver,
  database: string,
  defaults: CreateUserInput
): Promise<User> {
  const timestamp = now();

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      const result = await session.executeWrite(async (tx) => {
        return tx.run(GET_OR_CREATE_USER, {
          name: defaults.name,
          description: defaults.description,
          embedding: defaults.embedding,
          created_at: timestamp,
          updated_at: timestamp
        });
      });

      const record = result.records[0];
      if (!record) {
        throw new GraphClientError('Failed to get or create User', 'QUERY_ERROR');
      }
      return recordToUser(record.get('u'));
    },
    'getOrCreateUser'
  );
}

/**
 * Create ABOUT edge from Memory to User.
 * Links memories about the user (e.g., "I prefer dark mode") to the User node.
 */
export async function createAboutUserEdge(
  driver: Driver,
  database: string,
  memoryId: string
): Promise<string> {
  const edgeId = generateId();
  const timestamp = now();

  return runCommand(
    driver,
    database,
    'write',
    async (session) => {
      const result = await session.executeWrite(async (tx) => {
        return tx.run(CREATE_ABOUT_USER_EDGE, {
          memoryId,
          edgeId,
          created_at: timestamp
        });
      });

      const record = result.records[0];
      return record?.get('id') as string;
    },
    'createAboutUserEdge'
  );
}
