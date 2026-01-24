/**
 * Mock Factories for Integration Tests
 *
 * Provides configurable mock implementations of GraphClient, EmbeddingClient, and LLMClient.
 * These mocks return pre-defined data for testing pipeline flows without real dependencies.
 */

import type { z } from 'zod';
import type { EmbeddingClient } from '@/providers/embedding/types';
import type {
  Entity,
  EntityWithDegree,
  GraphClient,
  Memory,
  PPRResult,
  SearchResult
} from '@/providers/graph/types';
import type { LLMClient, Message } from '@/providers/llm/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Graph Client Mock
// ═══════════════════════════════════════════════════════════════════════════════

export interface MockGraphClientConfig {
  /** Memories to return from vector/fulltext/hybrid search */
  memories?: Memory[];
  /** Entities to return from entity lookups */
  entities?: Entity[];
  /** Search results for vector search */
  vectorSearchResults?: SearchResult<Memory>[];
  /** Search results for fulltext search */
  fulltextSearchResults?: SearchResult<Memory>[];
  /** PPR results for graph traversal */
  pprResults?: PPRResult[];
  /** Entities with degree for anchor phase */
  entitiesWithDegree?: EntityWithDegree[];
}

/**
 * Creates a mock GraphClient with configurable return values.
 * All methods return empty results by default unless configured.
 */
export function createMockGraphClient(config: MockGraphClientConfig = {}): GraphClient {
  const memories = config.memories ?? [];
  const entities = config.entities ?? [];
  const vectorResults =
    config.vectorSearchResults ?? memories.map((m) => ({ node: m, score: 0.8 }));
  const fulltextResults = config.fulltextSearchResults ?? [];
  const pprResults = config.pprResults ?? memories.map((m) => ({ memory: m, score: 0.5 }));
  const entitiesWithDegree =
    config.entitiesWithDegree ?? entities.map((e) => ({ entity: e, degree: 5 }));

  return {
    driver: null,
    database: 'test',

    // Connection
    connect: async () => {},
    disconnect: async () => {},
    healthCheck: async () => true,

    // Schema
    initializeSchema: async () => {},

    // User operations
    getUser: async () => ({
      id: 'USER' as const,
      name: 'Test User',
      type: 'Person' as const,
      description: 'A test user',
      embedding: [0.1, 0.2, 0.3],
      isWellKnown: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }),
    createUser: async (input) => ({
      id: 'USER' as const,
      ...input,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }),
    updateUser: async (updates) => ({
      id: 'USER' as const,
      name: updates.name ?? 'Test User',
      type: 'Person' as const,
      description: updates.description ?? 'A test user',
      embedding: updates.embedding ?? [0.1, 0.2, 0.3],
      isWellKnown: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }),
    getOrCreateUser: async (defaults) => ({
      id: 'USER' as const,
      ...defaults,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }),

    // Bulk node operations
    createEntities: async (inputs) =>
      inputs.map((input, i) => ({
        id: `entity-${i}`,
        ...input,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      })),
    createMemories: async (inputs) =>
      inputs.map((input, i) => ({
        id: `memory-${i}`,
        ...input,
        created_at: '2026-01-01T00:00:00.000Z'
      })),
    createNotes: async (inputs) =>
      inputs.map((input, i) => ({
        id: `note-${i}`,
        ...input
      })),

    // Individual lookups
    getEntityById: async (id) => entities.find((e) => e.id === id) ?? null,
    getEntityByName: async (name) => entities.find((e) => e.name === name) ?? null,
    getEntitiesWithDegree: async () => entitiesWithDegree,
    getMemoryById: async (id) => memories.find((m) => m.id === id) ?? null,
    getNoteById: async () => null,
    updateMemory: async (id, updates) => {
      const memory = memories.find((m) => m.id === id);
      return { ...memory!, ...updates };
    },
    updateEntity: async (id, updates) => {
      const entity = entities.find((e) => e.id === id);
      return { ...entity!, ...updates, updated_at: '2026-01-01T00:00:00.000Z' };
    },

    // Delete
    deleteNodes: async () => {},

    // Edges
    createMentionsEdge: async () => 'edge-1',
    createExtractedFromEdge: async () => 'edge-2',
    createInvalidatesEdge: async () => 'edge-3',
    createAboutEdge: async () => 'edge-4',
    createAboutUserEdge: async () => 'edge-5',

    // Search
    searchVector: async () => vectorResults as SearchResult<Memory | Entity>[],
    searchFulltext: async () => fulltextResults as SearchResult<Memory | Entity>[],
    searchHybrid: async () => vectorResults as SearchResult<Memory | Entity>[],

    // Traversal
    getNeighborhood: async () => memories,
    getMemoryAboutEntities: async (ids) => {
      const map = new Map<string, string[]>();
      for (const id of ids) {
        map.set(
          id,
          entities.slice(0, 2).map((e) => e.name)
        );
      }
      return map;
    },
    runPersonalizedPageRank: async () => pprResults,
    getMemoryInvalidates: async () => new Map(),
    getMemoryProvenance: async () => new Map(),
    getEntitiesByName: async (names) => {
      const map = new Map();
      for (const name of names) {
        const entity = entities.find((e) => e.name === name);
        if (entity) {
          map.set(name, {
            id: entity.id,
            name: entity.name,
            type: entity.type,
            description: entity.description,
            isWellKnown: entity.isWellKnown,
            isUser: false
          });
        }
      }
      return map;
    },

    // Transaction
    executeTransaction: async (fn) => {
      // Create a minimal transaction client that delegates to the mock
      const txClient = {
        createEntities: async (inputs: Parameters<GraphClient['createEntities']>[0]) =>
          inputs.map((input, i) => ({
            id: `entity-${i}`,
            ...input,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z'
          })),
        createMemories: async (inputs: Parameters<GraphClient['createMemories']>[0]) =>
          inputs.map((input, i) => ({
            id: `memory-${i}`,
            ...input,
            created_at: '2026-01-01T00:00:00.000Z'
          })),
        createNotes: async (inputs: Parameters<GraphClient['createNotes']>[0]) =>
          inputs.map((input, i) => ({
            id: `note-${i}`,
            ...input
          })),
        getOrCreateUser: async (defaults: Parameters<GraphClient['getOrCreateUser']>[0]) => ({
          id: 'USER' as const,
          ...defaults,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z'
        }),
        updateUser: async (updates: Parameters<GraphClient['updateUser']>[0]) => ({
          id: 'USER' as const,
          name: updates.name ?? 'Test User',
          type: 'Person' as const,
          description: updates.description ?? 'A test user',
          embedding: updates.embedding ?? [0.1, 0.2, 0.3],
          isWellKnown: false,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z'
        }),
        updateMemory: async (id: string, updates: Parameters<GraphClient['updateMemory']>[1]) => {
          const memory = memories.find((m) => m.id === id);
          return { ...memory!, ...updates };
        },
        updateEntity: async (id: string, updates: Parameters<GraphClient['updateEntity']>[1]) => {
          const entity = entities.find((e) => e.id === id);
          return { ...entity!, ...updates, updated_at: '2026-01-01T00:00:00.000Z' };
        },
        createMentionsEdge: async () => 'edge-1',
        createExtractedFromEdge: async () => 'edge-2',
        createInvalidatesEdge: async () => 'edge-3',
        createAboutEdge: async () => 'edge-4',
        createAboutUserEdge: async () => 'edge-5'
      };
      return fn(txClient);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Embedding Client Mock
// ═══════════════════════════════════════════════════════════════════════════════

export interface MockEmbeddingClientConfig {
  /** Embedding dimensions (default: 3) */
  dimensions?: number;
  /** Fixed embedding to return for all texts */
  fixedEmbedding?: number[];
}

/**
 * Creates a mock EmbeddingClient that returns deterministic embeddings.
 * By default, returns a simple hash-based embedding for reproducibility.
 */
export function createMockEmbeddingClient(config: MockEmbeddingClientConfig = {}): EmbeddingClient {
  const dimensions = config.dimensions ?? 3;
  const fixedEmbedding = config.fixedEmbedding ?? Array(dimensions).fill(0.5);

  return {
    dimensions,
    modelId: 'mock-embedding-model',

    embed: async () => fixedEmbedding,
    embedBatch: async (texts) => texts.map(() => fixedEmbedding)
  };
}

// ═══════════════════════════════════════��═══════════════════════════════════════
// LLM Client Mock
// ═══════════════════════════════════════════════════════════════════════════════

export interface MockLLMClientConfig {
  /** Response for completeJSON calls - must match the expected schema */
  jsonResponses?: Record<string, unknown>[];
  /** Response for complete calls */
  textResponse?: string;
  /** Map of response type to response data (for non-deterministic call order) */
  responsesByType?: {
    extractEntities?: unknown;
    resolveEntities?: unknown;
    extractMemories?: unknown;
    resolveMemories?: unknown;
    hyde?: unknown;
  };
}

/**
 * Creates a mock LLMClient with configurable responses.
 *
 * Two modes of operation:
 * 1. Sequential: Use jsonResponses array - responses are consumed in order
 * 2. Type-based: Use responsesByType - responses are matched by inspecting the messages
 *
 * Type-based is recommended for consolidation tests since branches run in parallel.
 */
export function createMockLLMClient(config: MockLLMClientConfig = {}): LLMClient {
  const jsonResponses = [...(config.jsonResponses ?? [])];
  const textResponse = config.textResponse ?? 'Mock response';
  const responsesByType = config.responsesByType;

  return {
    modelId: 'mock-llm-model',

    complete: async () => textResponse,

    completeJSON: async <T>(messages: Message[], _schema: z.ZodType<T>) => {
      // If responsesByType is configured, match by message content
      if (responsesByType) {
        const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';

        // Entity extraction agent
        if (
          systemPrompt.includes('entity extraction specialist') &&
          responsesByType.extractEntities
        ) {
          return responsesByType.extractEntities as T;
        }
        // Entity resolution agent
        if (
          systemPrompt.includes('entity resolution specialist') &&
          responsesByType.resolveEntities
        ) {
          return responsesByType.resolveEntities as T;
        }
        // Memory extraction agent
        if (
          systemPrompt.includes('memory extraction specialist') &&
          responsesByType.extractMemories
        ) {
          return responsesByType.extractMemories as T;
        }
        // Memory resolution agent
        if (
          systemPrompt.includes('memory resolution specialist') &&
          responsesByType.resolveMemories
        ) {
          return responsesByType.resolveMemories as T;
        }
        // HyDE generator agent
        if (
          (systemPrompt.includes('hypothetical document generator') ||
            systemPrompt.includes('HyDE')) &&
          responsesByType.hyde
        ) {
          return responsesByType.hyde as T;
        }
      }

      // Fall back to sequential mode
      const response = jsonResponses.shift();
      if (!response) {
        throw new Error('No more mock JSON responses available');
      }
      return response as T;
    },

    generateWithTools: async () => ({
      text: textResponse,
      steps: [],
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
    })
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Data Factories
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a mock Memory for testing.
 */
export function createTestMemory(overrides?: Partial<Memory>): Memory {
  return {
    id: overrides?.id ?? 'test-memory-1',
    content: overrides?.content ?? 'User prefers TypeScript over JavaScript',
    embedding: overrides?.embedding ?? [0.1, 0.2, 0.3],
    created_at: overrides?.created_at ?? '2026-01-01T00:00:00.000Z',
    valid_at: overrides?.valid_at ?? '2026-01-01T00:00:00.000Z',
    invalid_at: overrides?.invalid_at ?? null
  };
}

/**
 * Creates a mock Entity for testing.
 */
export function createTestEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: overrides?.id ?? 'test-entity-1',
    name: overrides?.name ?? 'TypeScript',
    type: overrides?.type ?? 'Technology',
    description: overrides?.description ?? 'A typed superset of JavaScript',
    embedding: overrides?.embedding ?? [0.3, 0.4, 0.5],
    isWellKnown: overrides?.isWellKnown ?? true,
    created_at: overrides?.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: overrides?.updated_at ?? '2026-01-01T00:00:00.000Z'
  };
}
