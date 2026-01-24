/**
 * Entity Weight Algorithm Tests
 *
 * Tests for multi-signal entity weighting and normalization.
 */

import { describe, expect, test } from 'bun:test';
import {
  computeMultiSignalEntityWeights,
  normalizeEntityWeights
} from '@/core/retrieval/algorithms/weights';
import { createConfig } from '@/core/retrieval/config';
import type { EntityWithDetails, ScoredMemory } from '@/core/retrieval/types';

const config = createConfig();

describe('computeMultiSignalEntityWeights', () => {
  const queryEmbedding = [1, 0, 0]; // Unit vector in x direction

  function createEntity(
    name: string,
    embedding: number[] | null,
    degree: number
  ): EntityWithDetails {
    return { name, embedding, degree };
  }

  function createMemoryWithAbout(
    id: string,
    score: number,
    aboutEntityNames: string[],
    embedding?: number[]
  ): ScoredMemory {
    return {
      result: {
        id,
        content: `Memory ${id}`,
        embedding: embedding ?? [0.5, 0.5, 0],
        created_at: '2026-01-01T00:00:00.000Z',
        valid_at: null,
        invalid_at: null
      },
      score,
      source: 'vector',
      aboutEntityNames
    };
  }

  test('computes weights for entities with embeddings', () => {
    const entities = [
      createEntity('Bun', [0.9, 0.1, 0], 10),
      createEntity('Node', [0.1, 0.9, 0], 20)
    ];
    const seedMemories: ScoredMemory[] = [];

    const weights = computeMultiSignalEntityWeights(entities, seedMemories, queryEmbedding, config);

    // 'Bun' has higher similarity to query (0.9 vs 0.1)
    expect(weights.get('Bun')).toBeGreaterThan(weights.get('Node') ?? 0);
  });

  test('incorporates memory-based signal', () => {
    const entities = [
      createEntity('TypeScript', [0.5, 0.5, 0], 5),
      createEntity('JavaScript', [0.5, 0.5, 0], 5)
    ];

    // TypeScript has a memory with high query similarity
    const seedMemories = [createMemoryWithAbout('m1', 0.9, ['TypeScript'], [0.95, 0.05, 0])];

    const weights = computeMultiSignalEntityWeights(entities, seedMemories, queryEmbedding, config);

    // TypeScript should have higher weight due to memory-based signal
    expect(weights.get('TypeScript')).toBeGreaterThan(weights.get('JavaScript') ?? 0);
  });

  test('incorporates structural signal (degree)', () => {
    // Same embeddings, different degrees
    const entities = [
      createEntity('HighDegree', [0.5, 0.5, 0], 100),
      createEntity('LowDegree', [0.5, 0.5, 0], 2)
    ];

    const weights = computeMultiSignalEntityWeights(entities, [], queryEmbedding, config);

    // Higher degree should contribute to higher weight
    expect(weights.get('HighDegree')).toBeGreaterThan(weights.get('LowDegree') ?? 0);
  });

  test('uses log-dampening for degree (prevents hub domination)', () => {
    const entities = [
      createEntity('MegaHub', [0.5, 0.5, 0], 10000),
      createEntity('SmallHub', [0.5, 0.5, 0], 10)
    ];

    const weights = computeMultiSignalEntityWeights(entities, [], queryEmbedding, config);

    const megaWeight = weights.get('MegaHub') ?? 0;
    const smallWeight = weights.get('SmallHub') ?? 0;

    // Ratio should be much smaller than 1000x (the raw degree ratio)
    // log(10001)/log(11) ≈ 9.2/2.4 ≈ 3.8x
    const ratio = megaWeight / smallWeight;
    expect(ratio).toBeLessThan(10);
    expect(ratio).toBeGreaterThan(1);
  });

  test('handles entities without embeddings', () => {
    const entities = [
      createEntity('NoEmbed', null, 10),
      createEntity('WithEmbed', [0.9, 0.1, 0], 10)
    ];

    const weights = computeMultiSignalEntityWeights(entities, [], queryEmbedding, config);

    // Should not crash, should have weights for both
    expect(weights.has('NoEmbed')).toBe(true);
    expect(weights.has('WithEmbed')).toBe(true);

    // WithEmbed should have higher weight (has semantic signal)
    expect(weights.get('WithEmbed')).toBeGreaterThan(weights.get('NoEmbed') ?? 0);
  });

  test('returns empty map for empty entities', () => {
    const weights = computeMultiSignalEntityWeights([], [], queryEmbedding, config);
    expect(weights.size).toBe(0);
  });
});

describe('normalizeEntityWeights', () => {
  test('normalizes weights to sum to 1', () => {
    const weights = new Map([
      ['A', 0.5],
      ['B', 0.3],
      ['C', 0.2]
    ]);

    const normalized = normalizeEntityWeights(weights);
    const sum = Array.from(normalized.values()).reduce((a, b) => a + b, 0);

    expect(sum).toBeCloseTo(1, 10);
  });

  test('preserves relative proportions', () => {
    const weights = new Map([
      ['A', 10],
      ['B', 5]
    ]);

    const normalized = normalizeEntityWeights(weights);

    // A should be twice B
    expect(normalized.get('A')! / normalized.get('B')!).toBeCloseTo(2, 10);
  });

  test('returns empty map for zero total weight', () => {
    const weights = new Map([
      ['A', 0],
      ['B', 0]
    ]);

    const normalized = normalizeEntityWeights(weights);
    expect(normalized.size).toBe(0);
  });

  test('returns empty map for negative total weight', () => {
    const weights = new Map([
      ['A', -0.5],
      ['B', 0.3]
    ]);

    const normalized = normalizeEntityWeights(weights);
    expect(normalized.size).toBe(0);
  });

  test('handles single entity', () => {
    const weights = new Map([['A', 0.5]]);

    const normalized = normalizeEntityWeights(weights);

    expect(normalized.get('A')).toBe(1);
  });
});
