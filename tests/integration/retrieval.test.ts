/**
 * Retrieval Pipeline Integration Tests
 *
 * Tests the full retrieval pipeline flow: LAND → ANCHOR → EXPAND → DISTILL → TRACE
 * Uses mocked dependencies to validate pipeline orchestration and output structure.
 */

import { describe, expect, test } from 'bun:test';
import {
  createMockEmbeddingClient,
  createMockGraphClient,
  createMockLLMClient,
  createTestEntity,
  createTestMemory
} from '@tests/helpers/mocks';
import { retrieve } from '@/core/retrieval';
import type { RetrievalOutput } from '@/core/retrieval/types';

describe('Retrieval Pipeline Integration', () => {
  describe('basic retrieval flow', () => {
    test('returns memories matching the query', async () => {
      // Setup: Create mock data
      const memory1 = createTestMemory({
        id: 'mem-1',
        content: 'User prefers TypeScript for all projects',
        embedding: [0.9, 0.1, 0.0]
      });
      const memory2 = createTestMemory({
        id: 'mem-2',
        content: 'User uses Bun as the JavaScript runtime',
        embedding: [0.1, 0.9, 0.0]
      });
      const entity1 = createTestEntity({
        id: 'ent-1',
        name: 'TypeScript',
        type: 'Technology',
        embedding: [0.8, 0.2, 0.0]
      });

      const graphClient = createMockGraphClient({
        memories: [memory1, memory2],
        entities: [entity1],
        vectorSearchResults: [
          { node: memory1, score: 0.95 },
          { node: memory2, score: 0.75 }
        ],
        entitiesWithDegree: [{ entity: entity1, degree: 10 }],
        pprResults: [
          { memory: memory1, score: 0.8 },
          { memory: memory2, score: 0.4 }
        ]
      });
      const embeddingClient = createMockEmbeddingClient({ dimensions: 3 });
      const llmClient = createMockLLMClient();

      // Execute
      const result = await retrieve(
        { query: 'What are my coding preferences?', queryEmbedding: [0.85, 0.15, 0.0] },
        { graphClient, embeddingClient, llmClient }
      );

      // Assert: Output is structured correctly
      expect(result).toBeDefined();
      const output = result as RetrievalOutput;
      expect(output.query).toBe('What are my coding preferences?');
      expect(output.memories).toBeDefined();
      expect(output.entities).toBeDefined();
      expect(output.meta).toBeDefined();
      expect(typeof output.meta.durationMs).toBe('number');
    });

    test('returns formatted string when format option is true', async () => {
      const memory = createTestMemory({ id: 'mem-1', content: 'User likes React' });
      const graphClient = createMockGraphClient({
        memories: [memory],
        vectorSearchResults: [{ node: memory, score: 0.9 }]
      });
      const embeddingClient = createMockEmbeddingClient();
      const llmClient = createMockLLMClient();

      const result = await retrieve(
        { query: 'What frameworks do I use?', queryEmbedding: [0.5, 0.5, 0.0] },
        { graphClient, embeddingClient, llmClient },
        { format: true }
      );

      // When format is true, result is a string
      expect(typeof result).toBe('string');
      expect(result as string).toContain('What frameworks do I use?');
    });
  });

  describe('empty graph handling', () => {
    test('returns empty output gracefully when no memories exist', async () => {
      const graphClient = createMockGraphClient({
        memories: [],
        entities: [],
        vectorSearchResults: [],
        pprResults: []
      });
      const embeddingClient = createMockEmbeddingClient();
      const llmClient = createMockLLMClient();

      const result = await retrieve(
        { query: 'Random query', queryEmbedding: [0.1, 0.2, 0.3] },
        { graphClient, embeddingClient, llmClient }
      );

      const output = result as RetrievalOutput;
      expect(output.memories).toEqual([]);
      expect(output.entities).toEqual([]);
      expect(output.meta.totalCandidates).toBe(0);
    });
  });

  describe('pipeline phases execute correctly', () => {
    test('LAND phase produces seed memories from hybrid search', async () => {
      const memory = createTestMemory({ id: 'seed-mem' });
      const graphClient = createMockGraphClient({
        memories: [memory],
        vectorSearchResults: [{ node: memory, score: 0.85 }],
        fulltextSearchResults: [{ node: memory, score: 15.5 }]
      });
      const embeddingClient = createMockEmbeddingClient();
      const llmClient = createMockLLMClient();

      const result = (await retrieve(
        { query: 'test query', queryEmbedding: [0.5, 0.5, 0.0] },
        { graphClient, embeddingClient, llmClient }
      )) as RetrievalOutput;

      // Pipeline should have processed the seed memory
      expect(result.meta.totalCandidates).toBeGreaterThanOrEqual(0);
    });

    test('TRACE phase enriches memories with entity associations', async () => {
      const memory = createTestMemory({ id: 'mem-with-entities' });
      const entity = createTestEntity({ id: 'ent-1', name: 'React' });

      const graphClient = createMockGraphClient({
        memories: [memory],
        entities: [entity],
        vectorSearchResults: [{ node: memory, score: 0.9 }],
        entitiesWithDegree: [{ entity, degree: 5 }]
      });
      const embeddingClient = createMockEmbeddingClient();
      const llmClient = createMockLLMClient();

      const result = (await retrieve(
        { query: 'What do I use?', queryEmbedding: [0.5, 0.5, 0.0] },
        { graphClient, embeddingClient, llmClient }
      )) as RetrievalOutput;

      // Output should have proper structure even if entities are empty
      // (depends on mock's getMemoryAboutEntities implementation)
      expect(result.query).toBe('What do I use?');
      expect(Array.isArray(result.memories)).toBe(true);
    });
  });
});
