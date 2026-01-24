/**
 * Skip Patterns Filter Tests
 *
 * Tests for the retrieval skip filter system.
 */

import { describe, expect, test } from 'bun:test';
import { shouldSkipRetrieval } from '@/proxy/filters';
import { SKIP_PATTERNS } from '@/proxy/filters/skip-patterns';

// ═══════════════════════════════════════════════════════════════════════════════
// Skip Patterns
// ═══════════════════════════════════════════════════════════════════════════════

describe('SKIP_PATTERNS', () => {
  test('includes Continue.dev title generation pattern', () => {
    expect(SKIP_PATTERNS).toContain('reply with a title');
  });

  test('is a non-empty array', () => {
    expect(Array.isArray(SKIP_PATTERNS)).toBe(true);
    expect(SKIP_PATTERNS.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// shouldSkipRetrieval Function
// ═══════════════════════════════════════════════════════════════════════════════

describe('shouldSkipRetrieval', () => {
  test('returns true for Continue.dev title request', () => {
    const query = 'Reply with a title for this conversation';
    expect(shouldSkipRetrieval(query)).toBe(true);
  });

  test('is case insensitive', () => {
    expect(shouldSkipRetrieval('REPLY WITH A TITLE')).toBe(true);
    expect(shouldSkipRetrieval('Reply With A Title')).toBe(true);
    expect(shouldSkipRetrieval('reply WITH a TITLE')).toBe(true);
  });

  test('matches partial queries containing pattern', () => {
    const query = 'Please reply with a title for this chat session, thanks!';
    expect(shouldSkipRetrieval(query)).toBe(true);
  });

  test('returns false for normal user queries', () => {
    expect(shouldSkipRetrieval('What is my email address?')).toBe(false);
    expect(shouldSkipRetrieval('How do I configure TypeScript?')).toBe(false);
    expect(shouldSkipRetrieval('Tell me about my preferences')).toBe(false);
  });

  test('returns false for empty query', () => {
    expect(shouldSkipRetrieval('')).toBe(false);
  });

  test('returns false for queries with similar but non-matching text', () => {
    // These are similar but shouldn't match the exact pattern
    expect(shouldSkipRetrieval('give me a title')).toBe(false);
    expect(shouldSkipRetrieval('what is the title')).toBe(false);
    expect(shouldSkipRetrieval('reply')).toBe(false);
  });
});
