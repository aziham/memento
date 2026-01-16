/**
 * Consolidation Pipeline Phases
 *
 * The pipeline has two parallel branches:
 *
 * Branch A: Context Retrieval
 *   - retrieve-context → Retrieval pipeline + HyDE augmentation
 *
 * Branch B: Entity & Memory Extraction
 *   - extract-entities  → Extract entities from note
 *   - search-entities   → Search for existing entity matches
 *   - resolve-entities  → Decide CREATE/MATCH for entities
 *   - extract-memories  → Extract memories from note
 *
 * Join:
 *   - resolve-memories  → Decide ADD/SKIP/INVALIDATE for memories
 *
 * Write:
 *   - write-graph       → Write results to graph
 */

export {
  type ExtractEntitiesInput,
  type ExtractEntitiesOutput,
  extractEntities
} from './extract-entities';
export { type ExtractMemoriesInput, extractMemories } from './extract-memories';
export {
  type ResolveEntitiesInput,
  type ResolveEntitiesOutput,
  resolveEntities
} from './resolve-entities';
export { type ResolveMemoriesInput, resolveMemories } from './resolve-memories';
export {
  type RetrieveContextConfig,
  type RetrieveContextDependencies,
  type RetrieveContextInput,
  type RetrieveContextOutput,
  retrieveContext
} from './retrieve-context';
export { searchEntities } from './search-entities';
export {
  type WriteGraphDependencies,
  type WriteGraphInput,
  type WriteGraphOutput,
  writeGraph
} from './write-graph';
