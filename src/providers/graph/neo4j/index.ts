/**
 * Neo4j Graph Provider Module
 *
 * Modular implementation of the GraphClient interface for Neo4j.
 */

export type { Neo4jConfig } from './client';
// Client (public API)
export { Neo4jGraphClient } from './client';

export type { IndexName, Label, RelType } from './constants';
// Foundation exports for internal use
export { INDEXES, LABELS, RELS, RETRY } from './constants';
export type { CommandMode } from './errors';
export {
  classifyNeo4jError,
  isSchemaAlreadyExistsError,
  runCommand,
  runCommandWithRetry,
  withRetry
} from './errors';
export type { Neo4jNode } from './mapping';
export { recordToEntity, recordToMemory, recordToNote } from './mapping';

// Query repository
export * from './queries';

// Schema management
export { initializeSchema } from './schema';
