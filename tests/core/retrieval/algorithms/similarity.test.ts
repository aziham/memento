/**
 * Similarity Algorithm Tests
 *
 * Tests for cosine similarity computation.
 */

import { describe, expect, test } from 'bun:test';
import { computeCosineSimilarity } from '@/core/retrieval/algorithms/similarity';
import { UNIT_VECTOR_X, UNIT_VECTOR_Y, ZERO_VECTOR } from '../../../helpers/fixtures';

describe('computeCosineSimilarity', () => {
  test('returns 1 for identical vectors', () => {
    const vector = [0.6, 0.8, 0];
    const result = computeCosineSimilarity(vector, vector);
    expect(result).toBeCloseTo(1, 10);
  });

  test('returns 0 for orthogonal vectors', () => {
    // Unit vectors in x and y directions are orthogonal
    const result = computeCosineSimilarity(UNIT_VECTOR_X, UNIT_VECTOR_Y);
    expect(result).toBeCloseTo(0, 10);
  });

  test('returns -1 for opposite vectors', () => {
    const vectorA = [1, 0, 0];
    const vectorB = [-1, 0, 0];
    const result = computeCosineSimilarity(vectorA, vectorB);
    expect(result).toBeCloseTo(-1, 10);
  });

  test('handles zero vectors (returns 0)', () => {
    const nonZero = [1, 0, 0];
    const result = computeCosineSimilarity(ZERO_VECTOR, nonZero);
    expect(result).toBe(0);
  });

  test('returns 0 for empty vectors', () => {
    const result = computeCosineSimilarity([], []);
    expect(result).toBe(0);
  });

  test('returns 0 for mismatched length vectors', () => {
    const vectorA = [1, 0, 0];
    const vectorB = [1, 0];
    const result = computeCosineSimilarity(vectorA, vectorB);
    expect(result).toBe(0);
  });

  test('computes dot product correctly for normalized vectors', () => {
    // For L2-normalized vectors, cosine similarity = dot product
    const vectorA = [0.6, 0.8, 0]; // normalized
    const vectorB = [0.8, 0.6, 0]; // normalized

    // Expected: 0.6*0.8 + 0.8*0.6 + 0*0 = 0.48 + 0.48 = 0.96
    const result = computeCosineSimilarity(vectorA, vectorB);
    expect(result).toBeCloseTo(0.96, 10);
  });

  test('handles high-dimensional vectors', () => {
    // Two random-ish normalized vectors
    const dim = 1536;
    const vectorA = Array.from({ length: dim }, (_, i) => Math.sin(i) / Math.sqrt(dim / 2));
    const vectorB = Array.from({ length: dim }, (_, i) => Math.cos(i) / Math.sqrt(dim / 2));

    const result = computeCosineSimilarity(vectorA, vectorB);
    // Should be some value between -1 and 1
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });
});
