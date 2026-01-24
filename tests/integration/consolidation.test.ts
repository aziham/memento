/**
 * Consolidation Pipeline Integration Tests
 *
 * Tests the full consolidation pipeline flow:
 * Branch A (Context Retrieval) + Branch B (Entity/Memory Extraction) → Join → Write
 * Uses mocked dependencies to validate pipeline orchestration and decision logic.
 */

import { describe, expect, test } from 'bun:test';
import {
  createMockEmbeddingClient,
  createMockGraphClient,
  createMockLLMClient
} from '@tests/helpers/mocks';
import { runPipeline } from '@/core/consolidation/pipeline';

describe('Consolidation Pipeline Integration', () => {
  describe('basic consolidation flow', () => {
    test('extracts entities and memories from a note', async () => {
      const graphClient = createMockGraphClient({
        memories: [],
        entities: []
      });
      const embeddingClient = createMockEmbeddingClient({ dimensions: 3 });

      // Use type-based responses since branches run in parallel
      const llmClient = createMockLLMClient({
        responsesByType: {
          extractEntities: {
            entities: [
              {
                name: 'TypeScript',
                type: 'Technology',
                description: 'A typed superset of JavaScript',
                isWellKnown: true
              },
              {
                name: 'Bun',
                type: 'Technology',
                description: 'A fast JavaScript runtime',
                isWellKnown: false
              }
            ],
            userBiographicalFacts: null
          },
          resolveEntities: {
            entities: [
              {
                entityName: 'TypeScript',
                entityType: 'Technology',
                action: 'CREATE',
                reason: 'New entity'
              },
              {
                entityName: 'Bun',
                entityType: 'Technology',
                action: 'CREATE',
                reason: 'New entity'
              }
            ],
            userDescriptionUpdate: null
          },
          extractMemories: [
            {
              content: 'User prefers TypeScript for all projects',
              aboutEntities: ['TypeScript'],
              validAt: null
            }
          ],
          resolveMemories: [
            {
              memoryContent: 'User prefers TypeScript for all projects',
              action: 'ADD',
              reason: 'New memory'
            }
          ]
        }
      });

      // Execute
      const result = await runPipeline(
        {
          content: 'I prefer TypeScript and use Bun as my runtime',
          timestamp: '2026-01-15T10:00:00.000Z'
        },
        { graphClient, embeddingClient, llmClient },
        { temperature: 0.1, maxTokens: 2000, maxRetries: 2 }
      );

      // Assert: Pipeline produces entity and memory decisions
      expect(result.entities).toBeDefined();
      expect(result.entities.length).toBe(2);
      expect(result.entities[0]?.action).toBe('CREATE');
      expect(result.entities[0]?.name).toBe('TypeScript'); // Normalized to Title Case

      expect(result.memories).toBeDefined();
      expect(result.memories.length).toBe(1);
      expect(result.memories[0]?.action).toBe('ADD');

      expect(result.stats.totalLLMCalls).toBeGreaterThan(0);
    });

    test('matches existing entity when found in graph', async () => {
      const graphClient = createMockGraphClient({
        memories: [],
        entities: []
      });
      const embeddingClient = createMockEmbeddingClient();

      // Resolution decides to MATCH an existing entity
      const llmClient = createMockLLMClient({
        responsesByType: {
          extractEntities: {
            entities: [
              {
                name: 'TypeScript',
                type: 'Technology',
                description: 'A typed superset of JavaScript',
                isWellKnown: true
              }
            ],
            userBiographicalFacts: null
          },
          resolveEntities: {
            entities: [
              {
                entityName: 'TypeScript',
                entityType: 'Technology',
                action: 'MATCH',
                matchedEntityId: 'existing-ts',
                reason: 'Matches existing entity'
              }
            ],
            userDescriptionUpdate: null
          },
          extractMemories: [
            { content: 'User is learning TypeScript', aboutEntities: ['TypeScript'], validAt: null }
          ],
          resolveMemories: [
            { memoryContent: 'User is learning TypeScript', action: 'ADD', reason: 'New memory' }
          ]
        }
      });

      // Execute
      const result = await runPipeline(
        { content: 'I am learning TypeScript', timestamp: '2026-01-15T10:00:00.000Z' },
        { graphClient, embeddingClient, llmClient },
        { temperature: 0.1, maxTokens: 2000, maxRetries: 2 }
      );

      // Assert: Entity was matched, not created
      expect(result.entities.length).toBe(1);
      expect(result.entities[0]?.action).toBe('MATCH');
      expect(result.entities[0]?.matchedEntityId).toBe('existing-ts');
    });
  });

  describe('parallel branch execution', () => {
    test('both branches complete and join successfully', async () => {
      const graphClient = createMockGraphClient();
      const embeddingClient = createMockEmbeddingClient();
      const llmClient = createMockLLMClient({
        responsesByType: {
          extractEntities: { entities: [], userBiographicalFacts: null },
          resolveEntities: { entities: [], userDescriptionUpdate: null },
          extractMemories: [],
          resolveMemories: []
        }
      });

      // Execute
      const result = await runPipeline(
        { content: 'Simple note with no entities', timestamp: '2026-01-15T10:00:00.000Z' },
        { graphClient, embeddingClient, llmClient },
        { temperature: 0.1, maxTokens: 2000, maxRetries: 2 }
      );

      // Assert: Pipeline completes even with empty results
      expect(result.entities).toEqual([]);
      expect(result.memories).toEqual([]);
      expect(result.stats).toBeDefined();
    });
  });

  describe('user biographical facts handling', () => {
    test('extracts and processes user biographical facts', async () => {
      const graphClient = createMockGraphClient();
      const embeddingClient = createMockEmbeddingClient();
      const llmClient = createMockLLMClient({
        responsesByType: {
          extractEntities: {
            entities: [],
            userBiographicalFacts: 'Software engineer based in San Francisco'
          },
          resolveEntities: {
            entities: [],
            userDescriptionUpdate: {
              newDescription: 'Software engineer based in San Francisco',
              shouldUpdate: true,
              reason: 'New biographical information about the user'
            }
          },
          extractMemories: [],
          resolveMemories: []
        }
      });

      const result = await runPipeline(
        {
          content: 'I am a software engineer in San Francisco',
          timestamp: '2026-01-15T10:00:00.000Z'
        },
        { graphClient, embeddingClient, llmClient },
        { temperature: 0.1, maxTokens: 2000, maxRetries: 2 }
      );

      // Assert: User description update is captured
      expect(result.userDescriptionUpdate).toBeDefined();
      expect(result.userDescriptionUpdate?.shouldUpdate).toBe(true);
      expect(result.userDescriptionUpdate?.newDescription).toContain('San Francisco');
    });
  });
});
