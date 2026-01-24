/**
 * Embedding Provider Utils Tests
 *
 * Tests for L2 normalization utility.
 */

import { describe, expect, test } from 'bun:test';
import {
  NORMALIZED_VECTOR,
  UNIT_VECTOR_X,
  UNNORMALIZED_VECTOR,
  ZERO_VECTOR
} from '@tests/helpers/fixtures';
import { normalizeL2 } from '@/providers/embedding/utils';

describe('normalizeL2', () => {
  test('normalizes a non-unit vector to unit length', () => {
    const result = normalizeL2(UNNORMALIZED_VECTOR);

    // Check each component
    expect(result[0]).toBeCloseTo(0.6, 10);
    expect(result[1]).toBeCloseTo(0.8, 10);
    expect(result[2]).toBeCloseTo(0, 10);

    // Verify magnitude is 1
    const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
    expect(magnitude).toBeCloseTo(1, 10);
  });

  test('preserves already normalized vectors', () => {
    const result = normalizeL2(NORMALIZED_VECTOR);

    expect(result[0]).toBeCloseTo(0.6, 10);
    expect(result[1]).toBeCloseTo(0.8, 10);
    expect(result[2]).toBeCloseTo(0, 10);
  });

  test('handles zero vector without division by zero', () => {
    const result = normalizeL2(ZERO_VECTOR);

    // Should return the original zero vector (not NaN or Infinity)
    expect(result).toEqual([0, 0, 0]);
  });

  test('handles unit vectors correctly', () => {
    const result = normalizeL2(UNIT_VECTOR_X);

    expect(result[0]).toBeCloseTo(1, 10);
    expect(result[1]).toBeCloseTo(0, 10);
    expect(result[2]).toBeCloseTo(0, 10);
  });

  test('does not mutate the input array', () => {
    const input = [3, 4, 0];
    const inputCopy = [...input];
    normalizeL2(input);

    expect(input).toEqual(inputCopy);
  });

  test('handles high-dimensional vectors', () => {
    // 1536-dimensional vector (OpenAI embedding size)
    const highDim = Array.from({ length: 1536 }, (_, i) => i / 1536);
    const result = normalizeL2(highDim);

    // Verify magnitude is 1
    const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
    expect(magnitude).toBeCloseTo(1, 10);
  });

  test('handles negative values correctly', () => {
    const vector = [-3, -4, 0];
    const result = normalizeL2(vector);

    expect(result[0]).toBeCloseTo(-0.6, 10);
    expect(result[1]).toBeCloseTo(-0.8, 10);
    expect(result[2]).toBeCloseTo(0, 10);
  });
});
