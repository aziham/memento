/**
 * Memory Invalidation Integration Tests
 *
 * Tests the memory invalidation flow within the consolidation pipeline.
 * Validates that contradicting memories are detected and marked for invalidation.
 */

import { describe, expect, test } from 'bun:test';
import {
  createMockEmbeddingClient,
  createMockGraphClient,
  createMockLLMClient,
  createTestMemory
} from '@tests/helpers/mocks';
import { runPipeline } from '@/core/consolidation/pipeline';

describe('Memory Invalidation Integration', () => {
  describe('contradiction detection', () => {
    test('detects contradiction and returns INVALIDATE decision', async () => {
      // Setup: Existing memory that will be contradicted
      const existingMemory = createTestMemory({
        id: 'old-memory-1',
        content: 'User prefers JavaScript over TypeScript'
      });

      const graphClient = createMockGraphClient({
        memories: [existingMemory],
        vectorSearchResults: [{ node: existingMemory, score: 0.85 }]
      });
      const embeddingClient = createMockEmbeddingClient();

      // LLM detects contradiction and returns INVALIDATE decision
      const llmClient = createMockLLMClient({
        responsesByType: {
          hyde: { semantic: [], stateChange: [] },
          extractEntities: { entities: [], userBiographicalFacts: null },
          resolveEntities: { entities: [], userDescriptionUpdate: null },
          extractMemories: [
            { content: 'User prefers TypeScript over JavaScript', aboutEntities: [], validAt: null }
          ],
          resolveMemories: [
            {
              memoryContent: 'User prefers TypeScript over JavaScript',
              action: 'INVALIDATE',
              invalidates: [
                {
                  existingMemoryId: 'old-memory-1',
                  reason: 'User changed preference from JavaScript to TypeScript'
                }
              ],
              reason: 'Contradicts existing memory about language preference'
            }
          ]
        }
      });

      // Execute
      const result = await runPipeline(
        {
          content: 'I now prefer TypeScript over JavaScript',
          timestamp: '2026-01-15T10:00:00.000Z'
        },
        { graphClient, embeddingClient, llmClient },
        { temperature: 0.1, maxTokens: 2000, maxRetries: 2 }
      );

      // Assert: Memory decision is INVALIDATE with correct target
      expect(result.memories.length).toBe(1);
      expect(result.memories[0]?.action).toBe('INVALIDATE');
      expect(result.memories[0]?.invalidates).toBeDefined();
      expect(result.memories[0]?.invalidates?.length).toBe(1);
      expect(result.memories[0]?.invalidates?.[0]?.existingMemoryId).toBe('old-memory-1');
      expect(result.memories[0]?.invalidates?.[0]?.reason).toContain('preference');
    });
  });

  describe('no conflict scenarios', () => {
    test('adds independent memory without invalidation', async () => {
      const graphClient = createMockGraphClient({
        memories: [],
        entities: []
      });
      const embeddingClient = createMockEmbeddingClient();

      const llmClient = createMockLLMClient({
        responsesByType: {
          extractEntities: { entities: [], userBiographicalFacts: null },
          resolveEntities: { entities: [], userDescriptionUpdate: null },
          extractMemories: [
            { content: 'User enjoys hiking on weekends', aboutEntities: [], validAt: null }
          ],
          resolveMemories: [
            {
              memoryContent: 'User enjoys hiking on weekends',
              action: 'ADD',
              reason: 'New hobby information'
            }
          ]
        }
      });

      const result = await runPipeline(
        { content: 'I enjoy hiking on weekends', timestamp: '2026-01-15T10:00:00.000Z' },
        { graphClient, embeddingClient, llmClient },
        { temperature: 0.1, maxTokens: 2000, maxRetries: 2 }
      );

      // Assert: Memory is added, not invalidated
      expect(result.memories.length).toBe(1);
      expect(result.memories[0]?.action).toBe('ADD');
      expect(result.memories[0]?.invalidates).toBeUndefined();
    });
  });

  describe('duplicate detection', () => {
    test('skips duplicate memory', async () => {
      const existingMemory = createTestMemory({
        id: 'existing-mem',
        content: 'User works at Acme Corp'
      });

      const graphClient = createMockGraphClient({
        memories: [existingMemory],
        vectorSearchResults: [{ node: existingMemory, score: 0.95 }]
      });
      const embeddingClient = createMockEmbeddingClient();

      // LLM detects duplicate and returns SKIP decision
      const llmClient = createMockLLMClient({
        responsesByType: {
          hyde: { semantic: [], stateChange: [] },
          extractEntities: { entities: [], userBiographicalFacts: null },
          resolveEntities: { entities: [], userDescriptionUpdate: null },
          extractMemories: [
            { content: 'User works at Acme Corp', aboutEntities: [], validAt: null }
          ],
          resolveMemories: [
            {
              memoryContent: 'User works at Acme Corp',
              action: 'SKIP',
              reason: 'Duplicate of existing memory'
            }
          ]
        }
      });

      const result = await runPipeline(
        { content: 'I work at Acme Corp', timestamp: '2026-01-15T10:00:00.000Z' },
        { graphClient, embeddingClient, llmClient },
        { temperature: 0.1, maxTokens: 2000, maxRetries: 2 }
      );

      // Assert: Memory is skipped
      expect(result.memories.length).toBe(1);
      expect(result.memories[0]?.action).toBe('SKIP');
      expect(result.memories[0]?.reason).toContain('Duplicate');
    });
  });

  describe('multiple invalidations', () => {
    test('handles memory that invalidates multiple existing memories', async () => {
      const oldMemory1 = createTestMemory({ id: 'old-1', content: 'User uses React 17' });
      const oldMemory2 = createTestMemory({ id: 'old-2', content: 'User is on React 17.0.2' });

      const graphClient = createMockGraphClient({
        memories: [oldMemory1, oldMemory2],
        vectorSearchResults: [
          { node: oldMemory1, score: 0.9 },
          { node: oldMemory2, score: 0.85 }
        ]
      });
      const embeddingClient = createMockEmbeddingClient();

      const llmClient = createMockLLMClient({
        responsesByType: {
          hyde: { semantic: [], stateChange: [] },
          extractEntities: { entities: [], userBiographicalFacts: null },
          resolveEntities: { entities: [], userDescriptionUpdate: null },
          extractMemories: [
            { content: 'User upgraded to React 18', aboutEntities: [], validAt: null }
          ],
          resolveMemories: [
            {
              memoryContent: 'User upgraded to React 18',
              action: 'INVALIDATE',
              invalidates: [
                { existingMemoryId: 'old-1', reason: 'Upgraded from React 17 to React 18' },
                { existingMemoryId: 'old-2', reason: 'No longer on React 17.0.2' }
              ],
              reason: 'Major version upgrade invalidates previous version memories'
            }
          ]
        }
      });

      const result = await runPipeline(
        { content: 'I upgraded to React 18 today', timestamp: '2026-01-15T10:00:00.000Z' },
        { graphClient, embeddingClient, llmClient },
        { temperature: 0.1, maxTokens: 2000, maxRetries: 2 }
      );

      // Assert: Memory invalidates multiple existing memories
      expect(result.memories.length).toBe(1);
      expect(result.memories[0]?.action).toBe('INVALIDATE');
      expect(result.memories[0]?.invalidates?.length).toBe(2);

      const invalidatedIds = result.memories[0]?.invalidates?.map((i) => i.existingMemoryId);
      expect(invalidatedIds).toContain('old-1');
      expect(invalidatedIds).toContain('old-2');
    });
  });
});
