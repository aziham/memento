/**
 * Consolidation Utils Tests
 *
 * Tests for assertion utilities and entity name normalization.
 */

import { describe, expect, test } from 'bun:test';
import { assertDefined, normalizeEntityName } from '@/core/consolidation/utils';

describe('assertDefined', () => {
  test('returns the value when defined', () => {
    const value = 'hello';
    const result = assertDefined(value);
    expect(result).toBe('hello');
  });

  test('returns the value when zero (falsy but defined)', () => {
    const value = 0;
    const result = assertDefined(value);
    expect(result).toBe(0);
  });

  test('returns the value when empty string (falsy but defined)', () => {
    const value = '';
    const result = assertDefined(value);
    expect(result).toBe('');
  });

  test('returns the value when false (falsy but defined)', () => {
    const value = false;
    const result = assertDefined(value);
    expect(result).toBe(false);
  });

  test('throws on null', () => {
    expect(() => assertDefined(null)).toThrow('Expected value to be defined');
  });

  test('throws on undefined', () => {
    expect(() => assertDefined(undefined)).toThrow('Expected value to be defined');
  });

  test('throws with custom message', () => {
    expect(() => assertDefined(null, 'Custom error message')).toThrow('Custom error message');
  });

  test('narrows the type correctly', () => {
    const value: string | null = 'hello';
    const result: string = assertDefined(value);
    expect(result).toBe('hello');
  });
});

describe('normalizeEntityName', () => {
  describe('title case conversion', () => {
    test('converts all lowercase to title case', () => {
      expect(normalizeEntityName('machine learning')).toBe('Machine Learning');
    });

    test('converts single word to title case', () => {
      expect(normalizeEntityName('typescript')).toBe('Typescript');
    });
  });

  describe('acronym preservation', () => {
    test('preserves all-uppercase acronyms', () => {
      expect(normalizeEntityName('AWS')).toBe('AWS');
      expect(normalizeEntityName('NASA')).toBe('NASA');
      expect(normalizeEntityName('HTTP')).toBe('HTTP');
    });

    test('preserves acronyms with numbers', () => {
      expect(normalizeEntityName('GPT4')).toBe('GPT4');
      expect(normalizeEntityName('H2O')).toBe('H2O');
    });

    test('preserves two-letter acronyms', () => {
      expect(normalizeEntityName('AI')).toBe('AI');
    });
  });

  describe('mixed case preservation', () => {
    test('preserves existing mixed case (camelCase)', () => {
      expect(normalizeEntityName('TypeScript')).toBe('TypeScript');
      expect(normalizeEntityName('JavaScript')).toBe('JavaScript');
    });

    test('preserves mixed case with lowercase start', () => {
      expect(normalizeEntityName('iPhone')).toBe('iPhone');
    });

    test('preserves brand-style capitalization', () => {
      expect(normalizeEntityName('Neo4j')).toBe('Neo4j');
    });
  });

  describe('hyphenated names', () => {
    test('handles hyphenated names with lowercase parts', () => {
      expect(normalizeEntityName('test-driven development')).toBe('Test-Driven Development');
    });

    test('preserves acronyms in hyphenated names', () => {
      expect(normalizeEntityName('GPT-4')).toBe('GPT-4');
    });
  });

  describe('edge cases', () => {
    test('handles single character', () => {
      expect(normalizeEntityName('a')).toBe('A');
    });

    test('handles empty string', () => {
      expect(normalizeEntityName('')).toBe('');
    });

    test('handles multiple spaces', () => {
      const result = normalizeEntityName('hello  world');
      // Multiple spaces are preserved as separators
      expect(result).toBe('Hello  World');
    });
  });
});
