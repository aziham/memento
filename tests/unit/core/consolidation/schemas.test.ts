/**
 * Consolidation Schemas Tests
 *
 * Tests for Zod schema validation of LLM outputs.
 */

import { describe, expect, test } from 'bun:test';
import {
  ConsolidationInputSchema,
  EntityDecisionSchema,
  ExtractEntitiesOutputSchema,
  ExtractedEntitySchema,
  MemoryDecisionSchema,
  ResolvedEntitySchema,
  ResolveEntitiesOutputSchema
} from '@/core/consolidation/schemas';

describe('ConsolidationInputSchema', () => {
  test('accepts valid input with content and timestamp', () => {
    const input = {
      content: 'This is a note about programming',
      timestamp: '2026-01-14T10:00:00.000Z'
    };
    const result = ConsolidationInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('rejects empty content', () => {
    const input = {
      content: '',
      timestamp: '2026-01-14T10:00:00.000Z'
    };
    const result = ConsolidationInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('rejects invalid timestamp format', () => {
    const input = {
      content: 'Valid content',
      timestamp: 'not a timestamp'
    };
    const result = ConsolidationInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('ExtractedEntitySchema', () => {
  test('accepts valid entity with all fields', () => {
    const entity = {
      name: 'Bun',
      type: 'Technology',
      description: 'A JavaScript runtime and toolkit',
      isWellKnown: true
    };
    const result = ExtractedEntitySchema.safeParse(entity);
    expect(result.success).toBe(true);
  });

  test('rejects invalid entity type', () => {
    const entity = {
      name: 'Test',
      type: 'InvalidType',
      description: 'Test description',
      isWellKnown: false
    };
    const result = ExtractedEntitySchema.safeParse(entity);
    expect(result.success).toBe(false);
  });

  test('accepts all valid entity types', () => {
    const validTypes = [
      'Person',
      'Organization',
      'Project',
      'Technology',
      'Location',
      'Event',
      'Concept'
    ];
    for (const type of validTypes) {
      const entity = {
        name: 'Test',
        type,
        description: 'Test',
        isWellKnown: false
      };
      const result = ExtractedEntitySchema.safeParse(entity);
      expect(result.success).toBe(true);
    }
  });
});

describe('ExtractEntitiesOutputSchema', () => {
  test('accepts entities with null userBiographicalFacts', () => {
    const output = {
      entities: [{ name: 'Bun', type: 'Technology', description: 'A runtime', isWellKnown: true }],
      userBiographicalFacts: null
    };
    const result = ExtractEntitiesOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('accepts entities with userBiographicalFacts string', () => {
    const output = {
      entities: [],
      userBiographicalFacts: 'Software engineer at Acme Corp'
    };
    const result = ExtractEntitiesOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });
});

describe('EntityDecisionSchema', () => {
  test('accepts CREATE decision with embedding', () => {
    const decision = {
      action: 'CREATE',
      name: 'Memento',
      type: 'Project',
      description: 'A memory layer for AI',
      embedding: [0.1, 0.2, 0.3],
      isWellKnown: false,
      reason: 'New entity not in graph'
    };
    const result = EntityDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  test('accepts MATCH decision with matchedEntityId', () => {
    const decision = {
      action: 'MATCH',
      name: 'Bun',
      type: 'Technology',
      description: 'A JavaScript runtime',
      matchedEntityId: 'entity-123',
      similarity: 0.95,
      updateDescription: true,
      reason: 'Matches existing entity'
    };
    const result = EntityDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  test('rejects invalid action', () => {
    const decision = {
      action: 'INVALID',
      name: 'Test',
      type: 'Technology',
      description: 'Test',
      reason: 'Test'
    };
    const result = EntityDecisionSchema.safeParse(decision);
    expect(result.success).toBe(false);
  });
});

describe('MemoryDecisionSchema', () => {
  test('accepts ADD decision', () => {
    const decision = {
      action: 'ADD',
      content: 'User prefers TypeScript',
      aboutEntities: ['TypeScript', 'User'],
      embedding: [0.1, 0.2, 0.3],
      reason: 'New preference'
    };
    const result = MemoryDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  test('accepts SKIP decision', () => {
    const decision = {
      action: 'SKIP',
      content: 'Already known',
      aboutEntities: [],
      reason: 'Duplicate memory'
    };
    const result = MemoryDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  test('accepts INVALIDATE decision with targets', () => {
    const decision = {
      action: 'INVALIDATE',
      content: 'User now prefers Bun over Node',
      aboutEntities: ['Bun', 'Node.js'],
      embedding: [0.1, 0.2, 0.3],
      invalidates: [{ existingMemoryId: 'memory-123', reason: 'User changed preference' }],
      reason: 'Updated preference'
    };
    const result = MemoryDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  test('accepts validAt as ISO datetime', () => {
    const decision = {
      action: 'ADD',
      content: 'Started new job',
      aboutEntities: ['User'],
      validAt: '2026-01-01T00:00:00.000Z',
      embedding: [0.1, 0.2],
      reason: 'Event with date'
    };
    const result = MemoryDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });
});

describe('ResolvedEntitySchema', () => {
  test('accepts CREATE resolution', () => {
    const resolution = {
      entityName: 'Memento',
      entityType: 'Project',
      action: 'CREATE',
      reason: 'No matching entity found'
    };
    const result = ResolvedEntitySchema.safeParse(resolution);
    expect(result.success).toBe(true);
  });

  test('accepts MATCH resolution with updateDescription', () => {
    const resolution = {
      entityName: 'Bun',
      entityType: 'Technology',
      action: 'MATCH',
      matchedEntityId: 'entity-456',
      updateDescription: true,
      reason: 'Matches with new info'
    };
    const result = ResolvedEntitySchema.safeParse(resolution);
    expect(result.success).toBe(true);
  });
});

describe('ResolveEntitiesOutputSchema', () => {
  test('accepts entities with null userDescriptionUpdate', () => {
    const output = {
      entities: [{ entityName: 'Bun', entityType: 'Technology', action: 'CREATE', reason: 'New' }],
      userDescriptionUpdate: null
    };
    const result = ResolveEntitiesOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('accepts entities with userDescriptionUpdate', () => {
    const output = {
      entities: [],
      userDescriptionUpdate: {
        newDescription: 'Software engineer working on AI projects',
        shouldUpdate: true,
        reason: 'Added new role information'
      }
    };
    const result = ResolveEntitiesOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });
});
