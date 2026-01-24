/**
 * Search Fusion Tests
 *
 * Tests for combining vector and fulltext search results.
 */

import { describe, expect, test } from 'bun:test';
import {
  computeCoverageAdjustedWeights,
  fuseSearchResults
} from '@/core/retrieval/algorithms/fusion';
import type { RankedResult, SearchFusionConfig } from '@/core/retrieval/types';

const defaultConfig: SearchFusionConfig = {
  vectorWeight: 0.7,
  fulltextWeight: 0.3,
  minResultsForFullWeight: 5,
  targetDistribution: { mean: 0.5, standardDeviation: 0.2 }
};

describe('computeCoverageAdjustedWeights', () => {
  test('returns base weights when both have full coverage', () => {
    const { vectorWeight, fulltextWeight } = computeCoverageAdjustedWeights(10, 10, defaultConfig);

    // Both have full coverage, so weights should be proportional to base weights
    expect(vectorWeight).toBeCloseTo(0.7, 5);
    expect(fulltextWeight).toBeCloseTo(0.3, 5);
  });

  test('reduces weight for sparse results', () => {
    // Fulltext only has 2 results (40% of minResultsForFullWeight)
    const { vectorWeight, fulltextWeight } = computeCoverageAdjustedWeights(10, 2, defaultConfig);

    // Fulltext weight should be reduced
    expect(fulltextWeight).toBeLessThan(0.3);
    // Vector weight should increase to compensate
    expect(vectorWeight).toBeGreaterThan(0.7);
    // Weights should sum to 1
    expect(vectorWeight + fulltextWeight).toBeCloseTo(1, 10);
  });

  test('handles zero results for one source', () => {
    const { vectorWeight, fulltextWeight } = computeCoverageAdjustedWeights(10, 0, defaultConfig);

    // All weight goes to vector
    expect(vectorWeight).toBe(1);
    expect(fulltextWeight).toBe(0);
  });

  test('weights sum to 1', () => {
    const testCases = [
      [5, 5],
      [10, 2],
      [3, 7],
      [1, 1]
    ];

    for (const [v, f] of testCases) {
      const { vectorWeight, fulltextWeight } = computeCoverageAdjustedWeights(
        v!,
        f!,
        defaultConfig
      );
      expect(vectorWeight + fulltextWeight).toBeCloseTo(1, 10);
    }
  });
});

describe('fuseSearchResults', () => {
  function createResult(id: string, score: number): RankedResult<{ id: string }> {
    return { result: { id }, score, source: 'vector' };
  }

  test('returns empty array when both inputs are empty', () => {
    const result = fuseSearchResults([], [], 'vector', 'fulltext', defaultConfig);
    expect(result).toEqual([]);
  });

  test('returns vector results when fulltext is empty', () => {
    const vectorResults = [createResult('a', 0.9), createResult('b', 0.8)];
    const result = fuseSearchResults(vectorResults, [], 'vector', 'fulltext', defaultConfig);

    expect(result).toHaveLength(2);
    expect(result[0]?.result.id).toBe('a');
    expect(result[0]?.source).toBe('vector');
  });

  test('returns fulltext results when vector is empty', () => {
    const fulltextResults = [createResult('a', 50), createResult('b', 30)];
    const result = fuseSearchResults([], fulltextResults, 'vector', 'fulltext', defaultConfig);

    expect(result).toHaveLength(2);
    expect(result[0]?.result.id).toBe('a');
    expect(result[0]?.source).toBe('fulltext');
  });

  test('combines results from both sources', () => {
    const vectorResults = [createResult('a', 0.9), createResult('b', 0.8)];
    const fulltextResults = [createResult('b', 50), createResult('c', 30)];

    const result = fuseSearchResults(
      vectorResults,
      fulltextResults,
      'vector',
      'fulltext',
      defaultConfig
    );

    // Should have all unique items: a, b, c
    const ids = result.map((r) => r.result.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
  });

  test('marks items found in both sources as "multiple"', () => {
    const vectorResults = [createResult('a', 0.9)];
    const fulltextResults = [createResult('a', 50)];

    const result = fuseSearchResults(
      vectorResults,
      fulltextResults,
      'vector',
      'fulltext',
      defaultConfig
    );

    expect(result[0]?.source).toBe('multiple');
  });

  test('items in both sources score higher than single-source items', () => {
    // Create enough results for meaningful normalization
    const vectorResults = [
      createResult('both', 0.9),
      createResult('v1', 0.85),
      createResult('v2', 0.8),
      createResult('v3', 0.75),
      createResult('v4', 0.7)
    ];
    const fulltextResults = [
      createResult('both', 50),
      createResult('f1', 40),
      createResult('f2', 30),
      createResult('f3', 20),
      createResult('f4', 10)
    ];

    const result = fuseSearchResults(
      vectorResults,
      fulltextResults,
      'vector',
      'fulltext',
      defaultConfig
    );

    // 'both' appears in both lists at top position, should have highest score
    expect(result[0]?.result.id).toBe('both');
    expect(result[0]?.source).toBe('multiple');
  });

  test('results are sorted by score descending', () => {
    const vectorResults = [createResult('a', 0.9), createResult('b', 0.7)];
    const fulltextResults = [createResult('c', 50), createResult('d', 20)];

    const result = fuseSearchResults(
      vectorResults,
      fulltextResults,
      'vector',
      'fulltext',
      defaultConfig
    );

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
    }
  });

  test('applies quality threshold to fulltext results', () => {
    const configWithThreshold: SearchFusionConfig = {
      ...defaultConfig,
      qualityThreshold: 0.3
    };

    const vectorResults = [createResult('a', 0.9)];
    // After normalization, some fulltext results may be below threshold
    const fulltextResults = [
      createResult('high', 100),
      createResult('medium', 50),
      createResult('low', 10)
    ];

    const result = fuseSearchResults(
      vectorResults,
      fulltextResults,
      'vector',
      'fulltext',
      configWithThreshold
    );

    // 'low' score after normalization will be 0 (min), which is below 0.3 threshold
    const ids = result.map((r) => r.result.id);
    expect(ids).not.toContain('low');
  });
});
