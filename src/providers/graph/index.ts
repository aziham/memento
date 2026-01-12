/**
 * Graph Provider Module
 *
 * Exports the GraphClient interface and Neo4j implementation.
 */

// Factory
export { createGraphClient } from './factory';

// Neo4j implementation
export type { Neo4jConfig } from './neo4j';
export { Neo4jGraphClient } from './neo4j';

// Types
export type {
  AboutEdge,
  CreateEntityInput,
  CreateMemoryInput,
  CreateNoteInput,
  EdgeBase,
  Entity,
  EntityType,
  ExtractedFromEdge,
  GraphClient,
  GraphErrorType,
  InvalidatesEdge,
  Memory,
  MentionsEdge,
  Note,
  SearchResult
} from './types';
export { ENTITY_TYPES, GraphClientError } from './types';

// Utilities
export { generateId, isValidTimestamp, now, sanitizeLucene } from './utils';
