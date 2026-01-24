/**
 * Graph Provider Utils Tests
 *
 * Tests for UUID generation, timestamp utilities, Lucene sanitization, and RRF fusion.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateId,
  isValidTimestamp,
  now,
  rrfFusion,
  sanitizeLucene
} from '@/providers/graph/utils';

describe('generateId', () => {
  test('generates valid UUID v7 format', () => {
    const id = generateId();
    // UUID v7 format: 8-4-4-4-12 hex characters
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(id)).toBe(true);
  });

  test('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(1000);
  });

  test('generates time-ordered IDs (lexicographically sortable)', () => {
    const id1 = generateId();
    // Small delay to ensure different timestamp
    const id2 = generateId();
    // UUID v7 should be lexicographically orderable by time
    // The first 48 bits are the timestamp
    expect(id1 < id2 || id1 === id2).toBe(true);
  });
});

describe('now', () => {
  test('returns ISO 8601 format', () => {
    const timestamp = now();
    // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(isoRegex.test(timestamp)).toBe(true);
  });

  test('returns current time (within 1 second)', () => {
    const before = Date.now();
    const timestamp = now();
    const after = Date.now();

    const parsed = new Date(timestamp).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});

describe('sanitizeLucene', () => {
  test('escapes special Lucene characters', () => {
    const input = 'hello + world - test';
    const result = sanitizeLucene(input);
    expect(result).toBe('hello \\+ world \\- test');
  });

  test('escapes all special characters', () => {
    // All Lucene special chars: + - & | ! ( ) { } [ ] ^ " ~ * ? : \ /
    const input = '+&|!(){}[]^"~*?:\\/';
    const result = sanitizeLucene(input);
    // Each char should be escaped with backslash
    expect(result).toBe('\\+\\&\\|\\!\\(\\)\\{\\}\\[\\]\\^\\"\\~\\*\\?\\:\\\\\\/');
  });

  test('preserves normal text', () => {
    const input = 'hello world';
    const result = sanitizeLucene(input);
    expect(result).toBe('hello world');
  });

  test('handles empty string', () => {
    const result = sanitizeLucene('');
    expect(result).toBe('');
  });

  test('escapes characters in realistic query', () => {
    const input = 'C++ programming (advanced)';
    const result = sanitizeLucene(input);
    expect(result).toBe('C\\+\\+ programming \\(advanced\\)');
  });
});

describe('isValidTimestamp', () => {
  test('accepts valid ISO 8601 timestamps', () => {
    expect(isValidTimestamp('2026-01-08T13:00:00.000Z')).toBe(true);
    expect(isValidTimestamp('2026-01-08T13:00:00Z')).toBe(true);
    expect(isValidTimestamp('2026-01-08')).toBe(true);
  });

  test('rejects invalid timestamps', () => {
    expect(isValidTimestamp('not a date')).toBe(false);
    expect(isValidTimestamp('')).toBe(false);
    expect(isValidTimestamp('2026-13-45')).toBe(false); // invalid month/day
  });
});

describe('rrfFusion', () => {
  test('combines results from multiple lists', () => {
    const list1 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const list2 = [{ id: 'b' }, { id: 'a' }, { id: 'd' }];

    const result = rrfFusion([list1, list2], 1);

    // 'a' and 'b' appear in both lists, should have higher scores
    const ids = result.map((r) => r.item.id);
    expect(ids.includes('a')).toBe(true);
    expect(ids.includes('b')).toBe(true);
    expect(ids.includes('c')).toBe(true);
    expect(ids.includes('d')).toBe(true);
  });

  test('items in both lists score higher than single-list items', () => {
    const list1 = [{ id: 'a' }, { id: 'b' }];
    const list2 = [{ id: 'a' }, { id: 'c' }];

    const result = rrfFusion([list1, list2], 1);

    // 'a' appears in both lists at position 0
    // Score: 1/(0+1) + 1/(0+1) = 2
    // 'b' appears only in list1 at position 1: 1/(1+1) = 0.5
    // 'c' appears only in list2 at position 1: 1/(1+1) = 0.5

    const aResult = result.find((r) => r.item.id === 'a');
    const bResult = result.find((r) => r.item.id === 'b');

    expect(aResult?.score).toBeGreaterThan(bResult?.score ?? 0);
  });

  test('results are sorted by score descending', () => {
    const list1 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const list2 = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];

    const result = rrfFusion([list1, list2], 1);

    // Verify scores are in descending order
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      if (prev && curr) {
        expect(prev.score).toBeGreaterThanOrEqual(curr.score);
      }
    }
  });

  test('handles empty lists', () => {
    const result = rrfFusion([], 1);
    expect(result).toEqual([]);
  });

  test('handles single list', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    const result = rrfFusion([list], 1);

    expect(result.length).toBe(2);
    expect(result[0]?.item.id).toBe('a');
    expect(result[1]?.item.id).toBe('b');
  });

  test('respects k parameter for score calculation', () => {
    const list = [{ id: 'a' }, { id: 'b' }];

    // With k=1: scores are 1/(0+1)=1, 1/(1+1)=0.5
    const resultK1 = rrfFusion([list], 1);
    expect(resultK1[0]?.score).toBe(1);
    expect(resultK1[1]?.score).toBe(0.5);

    // With k=60 (standard RRF): scores are 1/(0+60)≈0.0167, 1/(1+60)≈0.0164
    const resultK60 = rrfFusion([list], 60);
    expect(resultK60[0]?.score).toBeCloseTo(1 / 60, 5);
    expect(resultK60[1]?.score).toBeCloseTo(1 / 61, 5);
  });
});
