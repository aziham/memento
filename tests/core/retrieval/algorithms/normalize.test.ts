/**
 * Score Normalization Tests
 *
 * Tests for distribution alignment and min-max normalization.
 */

import { describe, expect, test } from 'bun:test';
import {
  alignScoreDistribution,
  normalizeToUnitRange
} from '@/core/retrieval/algorithms/normalize';
import {
  FULLTEXT_SCORES,
  IDENTICAL_SCORES,
  SINGLE_SCORE,
  VECTOR_SCORES
} from '../../../helpers/fixtures';

describe('alignScoreDistribution', () => {
  const targetDistribution = { mean: 0.5, standardDeviation: 0.2 };

  test('transforms tight distribution (vector scores)', () => {
    const result = alignScoreDistribution(VECTOR_SCORES, targetDistribution);

    // Calculate mean of result
    const mean = result.reduce((a, b) => a + b, 0) / result.length;
    expect(mean).toBeCloseTo(0.5, 1);

    // Verify it preserves relative ordering
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!).toBeGreaterThan(result[i]!);
    }
  });

  test('transforms wide distribution (BM25 scores)', () => {
    const result = alignScoreDistribution(FULLTEXT_SCORES, targetDistribution);

    // Calculate mean of result
    const mean = result.reduce((a, b) => a + b, 0) / result.length;
    expect(mean).toBeCloseTo(0.5, 1);

    // Verify it preserves relative ordering
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!).toBeGreaterThan(result[i]!);
    }
  });

  test('makes different distributions comparable', () => {
    const alignedVector = alignScoreDistribution(VECTOR_SCORES, targetDistribution);
    const alignedFulltext = alignScoreDistribution(FULLTEXT_SCORES, targetDistribution);

    // Both should now have similar mean
    const vectorMean = alignedVector.reduce((a, b) => a + b, 0) / alignedVector.length;
    const fulltextMean = alignedFulltext.reduce((a, b) => a + b, 0) / alignedFulltext.length;

    expect(vectorMean).toBeCloseTo(fulltextMean, 1);
  });

  test('handles single score (returns target mean)', () => {
    const result = alignScoreDistribution(SINGLE_SCORE, targetDistribution);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(0.5);
  });

  test('handles identical scores (returns target mean for all)', () => {
    const result = alignScoreDistribution(IDENTICAL_SCORES, targetDistribution);
    expect(result).toHaveLength(4);
    for (const score of result) {
      expect(score).toBe(0.5);
    }
  });

  test('handles empty array', () => {
    const result = alignScoreDistribution([], targetDistribution);
    expect(result).toEqual([]);
  });
});

describe('normalizeToUnitRange', () => {
  test('normalizes scores to [0, 1] range', () => {
    const scores = [10, 20, 30, 40, 50];
    const result = normalizeToUnitRange(scores);

    expect(result[0]).toBe(0); // min
    expect(result[4]).toBe(1); // max
    expect(result[2]).toBe(0.5); // middle
  });

  test('preserves relative ordering', () => {
    const result = normalizeToUnitRange(VECTOR_SCORES);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!).toBeGreaterThan(result[i]!);
    }
  });

  test('handles identical scores (returns 0.5 for all)', () => {
    const result = normalizeToUnitRange(IDENTICAL_SCORES);

    for (const score of result) {
      expect(score).toBe(0.5);
    }
  });

  test('handles empty array', () => {
    const result = normalizeToUnitRange([]);
    expect(result).toEqual([]);
  });

  test('handles negative scores', () => {
    const scores = [-10, 0, 10];
    const result = normalizeToUnitRange(scores);

    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0.5);
    expect(result[2]).toBe(1);
  });

  test('handles very small range', () => {
    const scores = [0.999, 1.0, 1.001];
    const result = normalizeToUnitRange(scores);

    expect(result[0]).toBe(0);
    expect(result[2]).toBe(1);
  });
});
