/**
 * Neo4j Schema Management
 *
 * Handles database schema initialization including constraints,
 * indexes (range, vector, fulltext). Designed for idempotent
 * execution - safe to run multiple times.
 */

import type { Session } from 'neo4j-driver';
import { INDEXES, LABELS } from './constants';
import { isSchemaAlreadyExistsError } from './errors';
import { CONSTRAINTS, createVectorIndexQuery, FULLTEXT_INDEXES, RANGE_INDEXES } from './queries';

// ============================================================
// SCHEMA INITIALIZATION
// ============================================================

/**
 * Initialize all database schema elements.
 *
 * Execution order matters:
 * 1. Constraints first (they create implicit indexes)
 * 2. Range indexes for temporal queries
 * 3. Vector indexes for semantic search
 * 4. Fulltext indexes for keyword search
 *
 * All operations are idempotent via IF NOT EXISTS clauses.
 *
 * @param session - Active Neo4j session
 * @param dimensions - Vector embedding dimensions (e.g., 1536 for OpenAI)
 */
export async function initializeSchema(session: Session, dimensions: number): Promise<void> {
  // Constraints
  await runSchemaOperation(session, CONSTRAINTS.USER_ID);
  await runSchemaOperation(session, CONSTRAINTS.ENTITY_ID);
  await runSchemaOperation(session, CONSTRAINTS.ENTITY_NAME);
  await runSchemaOperation(session, CONSTRAINTS.MEMORY_ID);
  await runSchemaOperation(session, CONSTRAINTS.NOTE_ID);

  // Range indexes
  await runSchemaOperation(session, RANGE_INDEXES.MEMORY_VALID_AT);
  await runSchemaOperation(session, RANGE_INDEXES.MEMORY_INVALID_AT);
  await runSchemaOperation(session, RANGE_INDEXES.NOTE_TIMESTAMP);

  // Vector indexes
  await runSchemaOperation(
    session,
    createVectorIndexQuery(INDEXES.USER_VECTOR, LABELS.USER, dimensions)
  );
  await runSchemaOperation(
    session,
    createVectorIndexQuery(INDEXES.MEMORY_VECTOR, LABELS.MEMORY, dimensions)
  );
  await runSchemaOperation(
    session,
    createVectorIndexQuery(INDEXES.ENTITY_VECTOR, LABELS.ENTITY, dimensions)
  );

  // Fulltext indexes
  await runSchemaOperation(session, FULLTEXT_INDEXES.MEMORY);
  await runSchemaOperation(session, FULLTEXT_INDEXES.ENTITY);
}

/**
 * Run a single schema operation, handling race conditions gracefully.
 *
 * Why catch "already exists" errors?
 * In a distributed environment, multiple instances may try to create
 * the same schema element simultaneously. The first wins, others
 * get "already exists" which is fine - the schema is in place.
 */
async function runSchemaOperation(session: Session, cypher: string): Promise<void> {
  try {
    await session.run(cypher);
  } catch (error) {
    // Handle race condition: another instance may have created the schema element
    if (isSchemaAlreadyExistsError(error)) {
      return;
    }
    throw error;
  }
}
