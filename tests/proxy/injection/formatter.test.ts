/**
 * XML Formatter Tests
 *
 * Tests for formatting retrieval output as XML for LLM consumption.
 */

import { describe, expect, test } from 'bun:test';
import type { EntityData, MemoryData, RetrievalOutput } from '@/core/retrieval/types';
import { formatRetrievalAsXML } from '@/proxy/injection/formatter';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

function createMockEntityData(overrides?: Partial<EntityData>): EntityData {
  return {
    id: overrides?.id ?? 'entity-1',
    name: overrides?.name ?? 'TypeScript',
    type: overrides?.type ?? 'Technology',
    description:
      'description' in (overrides ?? {})
        ? overrides!.description
        : 'A typed superset of JavaScript',
    isWellKnown: overrides?.isWellKnown ?? false,
    isUser: overrides?.isUser ?? false,
    memoryCount: overrides?.memoryCount ?? 2
  } as EntityData;
}

function createMockMemoryData(overrides?: Partial<MemoryData>): MemoryData {
  return {
    rank: overrides?.rank ?? 1,
    id: overrides?.id ?? 'memory-1',
    content: overrides?.content ?? 'User prefers strict TypeScript configuration',
    score: overrides?.score ?? 0.92,
    source: overrides?.source ?? 'vector',
    about: overrides?.about ?? ['TypeScript'],
    aboutEntityIds: overrides?.aboutEntityIds ?? ['entity-1'],
    validAt: 'validAt' in (overrides ?? {}) ? overrides!.validAt : '2026-01-15T10:00:00.000Z',
    invalidates: overrides?.invalidates,
    extractedFrom: overrides?.extractedFrom
  };
}

function createMockRetrievalOutput(overrides?: Partial<RetrievalOutput>): RetrievalOutput {
  return {
    query: overrides?.query ?? 'What are my TypeScript preferences?',
    entities: overrides?.entities ?? [createMockEntityData()],
    memories: overrides?.memories ?? [createMockMemoryData()],
    meta: overrides?.meta ?? { totalCandidates: 10, durationMs: 45 }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Basic Structure Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('formatRetrievalAsXML', () => {
  describe('basic structure', () => {
    test('includes current-date header', () => {
      const output = createMockRetrievalOutput();
      const xml = formatRetrievalAsXML(output);

      // Should have current-date tag with YYYY-MM-DD format
      expect(xml).toMatch(/<current-date>\d{4}-\d{2}-\d{2}<\/current-date>/);
    });

    test('includes query element', () => {
      const output = createMockRetrievalOutput({ query: 'my coding preferences' });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('<query>my coding preferences</query>');
    });

    test('includes entities section when entities exist', () => {
      const output = createMockRetrievalOutput();
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('<entities>');
      expect(xml).toContain('</entities>');
    });

    test('includes memories section when memories exist', () => {
      const output = createMockRetrievalOutput();
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('<memories>');
      expect(xml).toContain('</memories>');
    });

    test('omits entities section when no entities', () => {
      const output = createMockRetrievalOutput({ entities: [] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).not.toContain('<entities>');
    });

    test('omits memories section when no memories', () => {
      const output = createMockRetrievalOutput({ memories: [] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).not.toContain('<memories>');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Entity Formatting Tests
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('entity formatting', () => {
    test('formats entity with name and type attributes', () => {
      const entity = createMockEntityData({ name: 'Bun', type: 'Technology' });
      const output = createMockRetrievalOutput({ entities: [entity] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('name="Bun"');
      expect(xml).toContain('type="Technology"');
    });

    test('includes description element when present', () => {
      const entity = createMockEntityData({ description: 'A fast JavaScript runtime' });
      const output = createMockRetrievalOutput({ entities: [entity] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('<description>A fast JavaScript runtime</description>');
    });

    test('uses self-closing tag when no description', () => {
      const entity = createMockEntityData({ description: null });
      const output = createMockRetrievalOutput({ entities: [entity], memories: [] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toMatch(/<entity name="[^"]+" type="[^"]+" \/>/);
    });

    test('filters out well-known entities', () => {
      const entities = [
        createMockEntityData({ name: 'React', isWellKnown: true }),
        createMockEntityData({ name: 'MyProject', isWellKnown: false })
      ];
      const output = createMockRetrievalOutput({ entities });
      const xml = formatRetrievalAsXML(output);

      expect(xml).not.toContain('name="React"');
      expect(xml).toContain('name="MyProject"');
    });

    test('filters out entities with zero memoryCount', () => {
      const entities = [
        createMockEntityData({ name: 'Referenced', memoryCount: 3 }),
        createMockEntityData({ name: 'Orphan', memoryCount: 0 })
      ];
      const output = createMockRetrievalOutput({ entities });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('name="Referenced"');
      expect(xml).not.toContain('name="Orphan"');
    });

    test('uses "User" as type for user entity', () => {
      const entity = createMockEntityData({ name: 'Hamza', isUser: true, type: 'PERSON' });
      const output = createMockRetrievalOutput({ entities: [entity] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('type="User"');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Memory Formatting Tests
  // ═════════════════════════════════════════════════════════════���═════════════════

  describe('memory formatting', () => {
    test('includes content element', () => {
      const memory = createMockMemoryData({ content: 'User prefers dark mode' });
      const output = createMockRetrievalOutput({ memories: [memory] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('<content>User prefers dark mode</content>');
    });

    test('includes valid_since attribute when validAt present', () => {
      const memory = createMockMemoryData({ validAt: '2026-01-15T10:00:00.000Z' });
      const output = createMockRetrievalOutput({ memories: [memory] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('valid_since="2026-01-15"');
    });

    test('omits valid_since when validAt is null', () => {
      const memory = createMockMemoryData({ validAt: null });
      const output = createMockRetrievalOutput({ memories: [memory], entities: [] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).not.toContain('valid_since');
    });

    test('includes about section with entity names', () => {
      const memory = createMockMemoryData({ about: ['TypeScript', 'Bun'] });
      const output = createMockRetrievalOutput({ memories: [memory] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('<about>');
      expect(xml).toContain('<entity>TypeScript</entity>');
      expect(xml).toContain('<entity>Bun</entity>');
      expect(xml).toContain('</about>');
    });

    test('omits about section when empty', () => {
      const memory = createMockMemoryData({ about: [] });
      const output = createMockRetrievalOutput({ memories: [memory] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).not.toContain('<about>');
    });

    test('includes provenance when extractedFrom present', () => {
      const memory = createMockMemoryData({
        extractedFrom: {
          noteId: 'note-1',
          noteContent: 'I prefer strict TypeScript',
          noteTimestamp: '2026-01-10T14:30:00.000Z'
        }
      });
      const output = createMockRetrievalOutput({ memories: [memory] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('<extracted_from timestamp="2026-01-10">');
      expect(xml).toContain('<content>I prefer strict TypeScript</content>');
      expect(xml).toContain('</extracted_from>');
    });
  });

  // ════════════════════════════��══════════════════════════════════════════════════
  // Invalidation Chain Tests
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('invalidation chains', () => {
    test('formats single invalidation', () => {
      const memory = createMockMemoryData({
        invalidates: [
          {
            id: 'old-memory',
            content: 'User preferred Node.js',
            validAt: '2025-06-01T00:00:00.000Z',
            invalidatedAt: '2026-01-15T00:00:00.000Z',
            reason: 'User switched to Bun'
          }
        ]
      });
      const output = createMockRetrievalOutput({ memories: [memory] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('<invalidates>');
      expect(xml).toContain('valid_since="2025-06-01"');
      expect(xml).toContain('valid_until="2026-01-15"');
      expect(xml).toContain('<content>User preferred Node.js</content>');
      expect(xml).toContain('<reason>User switched to Bun</reason>');
      expect(xml).toContain('</invalidates>');
    });

    test('formats two-hop invalidation chain', () => {
      const memory = createMockMemoryData({
        invalidates: [
          {
            id: 'hop1-memory',
            content: 'User preferred Node.js',
            validAt: '2025-06-01T00:00:00.000Z',
            invalidatedAt: '2026-01-15T00:00:00.000Z',
            reason: 'User switched to Bun',
            invalidated: [
              {
                id: 'hop2-memory',
                content: 'User preferred Python for scripting',
                validAt: '2024-01-01T00:00:00.000Z',
                invalidatedAt: '2025-06-01T00:00:00.000Z',
                reason: 'User adopted Node.js ecosystem'
              }
            ]
          }
        ]
      });
      const output = createMockRetrievalOutput({ memories: [memory] });
      const xml = formatRetrievalAsXML(output);

      // Hop 1
      expect(xml).toContain('<content>User preferred Node.js</content>');
      expect(xml).toContain('<reason>User switched to Bun</reason>');

      // Hop 2 (nested)
      expect(xml).toContain('<content>User preferred Python for scripting</content>');
      expect(xml).toContain('<reason>User adopted Node.js ecosystem</reason>');
    });

    test('omits invalidates section when empty', () => {
      const memory = createMockMemoryData({ invalidates: undefined });
      const output = createMockRetrievalOutput({ memories: [memory] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).not.toContain('<invalidates>');
    });

    test('handles null dates in invalidation', () => {
      const memory = createMockMemoryData({
        invalidates: [
          {
            id: 'old-memory',
            content: 'Old preference',
            validAt: null,
            invalidatedAt: null,
            reason: null
          }
        ]
      });
      const output = createMockRetrievalOutput({ memories: [memory] });
      const xml = formatRetrievalAsXML(output);

      // Should not have valid_since or valid_until attributes
      expect(xml).not.toMatch(/valid_since="unknown"/);
      expect(xml).not.toContain('<reason>');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Date Formatting Tests
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('date formatting', () => {
    test('extracts date from ISO string without timezone conversion', () => {
      // Edge case: 11pm in EST (UTC-5) is next day in UTC
      // We want to preserve the original date, not convert to UTC
      const memory = createMockMemoryData({ validAt: '2024-01-15T23:00:00-05:00' });
      const output = createMockRetrievalOutput({ memories: [memory] });
      const xml = formatRetrievalAsXML(output);

      // Should be 2024-01-15, not 2024-01-16 (UTC)
      expect(xml).toContain('valid_since="2024-01-15"');
    });

    test('handles standard ISO format', () => {
      const memory = createMockMemoryData({ validAt: '2026-03-20T14:30:00.000Z' });
      const output = createMockRetrievalOutput({ memories: [memory] });
      const xml = formatRetrievalAsXML(output);

      expect(xml).toContain('valid_since="2026-03-20"');
    });
  });
});
