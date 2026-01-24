/**
 * MMR (Maximal Marginal Relevance) Tests
 *
 * Tests for adaptive lambda computation and diversity-aware reranking.
 */

import { describe, expect, test } from 'bun:test';
import { createScoredMemory } from '@tests/helpers/fixtures';
import { computeAdaptiveLambda, mmrRerank } from '@/core/retrieval/algorithms/mmr';
import { createConfig } from '@/core/retrieval/config';
import type { ScoredMemory } from '@/core/retrieval/types';

const config = createConfig();

describe('computeAdaptiveLambda', () => {
  test('returns max lambda for large score gap (clear winner)', () => {
    // Scores: [0.95, 0.42, 0.38, 0.35] - gap = 0.95 - avg ≈ 0.43
    const results: ScoredMemory[] = [
      createScoredMemory('a', 0.95),
      createScoredMemory('b', 0.42),
      createScoredMemory('c', 0.38),
      createScoredMemory('d', 0.35)
    ];

    const lambda = computeAdaptiveLambda(results, config);
    expect(lambda).toBe(config.distill.lambda.max);
  });

  test('returns min lambda for small score gap (many similar)', () => {
    // Scores: [0.78, 0.75, 0.73, 0.71] - gap = 0.78 - avg ≈ 0.04
    const results: ScoredMemory[] = [
      createScoredMemory('a', 0.78),
      createScoredMemory('b', 0.75),
      createScoredMemory('c', 0.73),
      createScoredMemory('d', 0.71)
    ];

    const lambda = computeAdaptiveLambda(results, config);
    expect(lambda).toBe(config.distill.lambda.min);
  });

  test('returns middle value for medium gap', () => {
    // Gap between 0.1 and 0.3
    const results: ScoredMemory[] = [
      createScoredMemory('a', 0.8),
      createScoredMemory('b', 0.6),
      createScoredMemory('c', 0.5)
    ];

    const lambda = computeAdaptiveLambda(results, config);
    expect(lambda).toBeGreaterThan(config.distill.lambda.min);
    expect(lambda).toBeLessThan(config.distill.lambda.max);
  });

  test('returns default for empty results', () => {
    const lambda = computeAdaptiveLambda([], config);
    const expectedDefault = (config.distill.lambda.min + config.distill.lambda.max) / 2;
    expect(lambda).toBe(expectedDefault);
  });

  test('handles single result', () => {
    const results: ScoredMemory[] = [createScoredMemory('a', 0.9)];
    const lambda = computeAdaptiveLambda(results, config);
    // Single result has gap = 0, should favor diversity
    expect(lambda).toBe(config.distill.lambda.min);
  });
});

describe('mmrRerank', () => {
  function createMemoryWithEmbedding(id: string, score: number, embedding: number[]): ScoredMemory {
    return {
      result: {
        id,
        content: `Memory ${id}`,
        embedding,
        created_at: '2026-01-01T00:00:00.000Z',
        valid_at: null,
        invalid_at: null
      },
      score,
      source: 'vector'
    };
  }

  test('returns all candidates when count <= topK', () => {
    const candidates = [
      createMemoryWithEmbedding('a', 0.9, [1, 0, 0]),
      createMemoryWithEmbedding('b', 0.8, [0, 1, 0])
    ];

    const result = mmrRerank(candidates, 0.7, 5);
    expect(result).toHaveLength(2);
  });

  test('selects top-scoring item first', () => {
    const candidates = [
      createMemoryWithEmbedding('top', 0.95, [1, 0, 0]),
      createMemoryWithEmbedding('second', 0.9, [0, 1, 0]),
      createMemoryWithEmbedding('third', 0.85, [0, 0, 1])
    ];

    const result = mmrRerank(candidates, 0.7, 2);
    expect(result[0]?.result.id).toBe('top');
  });

  test('favors diversity when lambda is low', () => {
    // Create similar embeddings for most items, one diverse item
    const candidates = [
      createMemoryWithEmbedding('similar1', 0.9, [1, 0, 0]),
      createMemoryWithEmbedding('similar2', 0.88, [0.99, 0.1, 0]),
      createMemoryWithEmbedding('diverse', 0.85, [0, 0, 1])
    ];

    // Low lambda = favor diversity
    const result = mmrRerank(candidates, 0.3, 2);

    // First should be highest score
    expect(result[0]?.result.id).toBe('similar1');
    // Second should be diverse item (orthogonal) even with lower score
    expect(result[1]?.result.id).toBe('diverse');
  });

  test('favors relevance when lambda is high', () => {
    const candidates = [
      createMemoryWithEmbedding('top', 0.9, [1, 0, 0]),
      createMemoryWithEmbedding('second', 0.88, [0.99, 0.1, 0]), // similar but high score
      createMemoryWithEmbedding('diverse', 0.5, [0, 0, 1]) // very diverse but low score
    ];

    // High lambda = favor relevance
    const result = mmrRerank(candidates, 0.95, 2);

    // Should pick by score more than diversity
    expect(result[0]?.result.id).toBe('top');
    expect(result[1]?.result.id).toBe('second');
  });

  test('handles candidates without embeddings', () => {
    const candidates: ScoredMemory[] = [
      {
        result: {
          id: 'no-embedding',
          content: 'No embedding',
          embedding: null,
          created_at: '2026-01-01T00:00:00.000Z',
          valid_at: null,
          invalid_at: null
        },
        score: 0.9,
        source: 'vector'
      },
      createMemoryWithEmbedding('with-embedding', 0.8, [1, 0, 0])
    ];

    const result = mmrRerank(candidates, 0.7, 2);
    // Should not crash, should return both
    expect(result).toHaveLength(2);
  });

  test('returns exactly topK results', () => {
    const candidates = [
      createMemoryWithEmbedding('a', 0.9, [1, 0, 0]),
      createMemoryWithEmbedding('b', 0.8, [0, 1, 0]),
      createMemoryWithEmbedding('c', 0.7, [0, 0, 1]),
      createMemoryWithEmbedding('d', 0.6, [1, 1, 0]),
      createMemoryWithEmbedding('e', 0.5, [1, 0, 1])
    ];

    const result = mmrRerank(candidates, 0.7, 3);
    expect(result).toHaveLength(3);
  });
});
