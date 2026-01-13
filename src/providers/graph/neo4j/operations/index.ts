/**
 * Neo4j Operations Module
 *
 * Re-exports all operation functions for clean imports.
 */

// Edge operations
export {
  createAboutEdge,
  createExtractedFromEdge,
  createInvalidatesEdge,
  createMentionsEdge
} from './edges';

// GDS (Graph Data Science) operations
export { runPersonalizedPageRank } from './gds';

// Node operations
export {
  createEntities,
  createMemories,
  createNotes,
  deleteNodes,
  getEntitiesWithDegree,
  getEntityById,
  getEntityByName,
  getMemoryById,
  getNoteById,
  updateEntity,
  updateMemory
} from './nodes';
// Search types that are still defined locally in search.ts
export type {
  EntityWithEmbedding,
  MemoryHistoryEntry,
  MemoryWithEmbedding,
  RelatedEntity,
  SearchOptions
} from './search';
// Search operations
export {
  getEntitiesByName,
  getEntitiesWithEmbeddings,
  getMemoriesAboutEntity,
  getMemoryAboutEntities,
  getMemoryHistory,
  getMemoryInvalidates,
  getMemoryProvenance,
  getNeighborhood,
  getRelatedEntities,
  searchFulltext,
  searchHybrid,
  searchVector
} from './search';

// Transaction operations
export { createTransactionClient } from './transaction';

// User operations
export {
  createAboutUserEdge,
  createUser,
  getOrCreateUser,
  getUser,
  updateUser
} from './user';
