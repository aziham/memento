---
description: Write unit tests for a pipeline component
argument-hint: [component-path]
---

# Write Tests: $ARGUMENTS

## Objective

Write comprehensive unit tests for `$ARGUMENTS`. Every algorithm and phase needs tests to ensure correctness and prevent regressions.

## Testing Framework

Memento uses **Bun's built-in test runner** with Jest-like API:

```typescript
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
```

### Key Functions

| Function     | Purpose                     |
| ------------ | --------------------------- |
| `describe`   | Group related tests         |
| `it`         | Define a single test case   |
| `expect`     | Make assertions             |
| `beforeEach` | Run setup before each test  |
| `afterEach`  | Run cleanup after each test |
| `mock`       | Create mock functions       |

## Directory Structure

Tests mirror the source structure:

```
src/                              tests/
├── core/                         ├── core/
│   ├── retrieval/               │   ├── retrieval/
│   │   ├── algorithms/          │   │   ���── algorithms/
│   │   │   ├── fusion.ts        │   │   │   ├── fusion.test.ts
│   │   │   ├── mmr.ts           │   │   │   ├── mmr.test.ts
│   │   │   └── similarity.ts    │   │   │   └── similarity.test.ts
│   │   └── phases/              │   │   └── phases/
│   │       └── land.ts          │   │       └── land.test.ts
│   └── consolidation/           │   └── consolidation/
│       └── schemas.ts           │       └── schemas.test.ts
├── providers/                    ├── providers/
│   └── embedding/               │   └── embedding/
│       └── utils.ts             │       └── utils.test.ts
└── proxy/                        └── proxy/
    └── injection/                   └── injection/
        └── formatter.ts                 └── formatter.test.ts
```

## Testing Patterns

### Pattern 1: Test Fixtures

Create reusable test data factories.

```typescript
// tests/helpers/fixtures.ts

import { randomUUID } from 'crypto';

/**
 * Create a mock embedding vector.
 */
export function createMockVector(dimensions: number = 1536): number[] {
  const vector = Array.from({ length: dimensions }, () => Math.random() - 0.5);
  // L2 normalize
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / norm);
}

/**
 * Create a deterministic vector for reproducible tests.
 */
export function createDeterministicVector(
  seed: number,
  dimensions: number = 1536
): number[] {
  const vector = Array.from(
    { length: dimensions },
    (_, i) => Math.sin(seed * 1000 + i) * 0.5
  );
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / norm);
}

/**
 * Create a scored item for algorithm tests.
 */
export function createScoredItem(
  id: string,
  score: number,
  overrides: Partial<ScoredItem> = {}
): ScoredItem {
  return { id, score, ...overrides };
}

/**
 * Create a mock memory.
 */
export function createMockMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: randomUUID(),
    content: 'Test memory content',
    embedding: createMockVector(),
    validAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Create a mock entity.
 */
export function createMockEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: randomUUID(),
    name: 'Test Entity',
    type: 'Concept',
    description: 'A test entity',
    embedding: createMockVector(),
    isWellKnown: false,
    ...overrides
  };
}
```

### Pattern 2: Algorithm Tests

Test pure functions with known inputs and outputs.

```typescript
// tests/core/retrieval/algorithms/similarity.test.ts

import { describe, it, expect } from 'bun:test';
import {
  cosineSimilarity,
  maxSimilarity
} from '@/core/retrieval/algorithms/similarity';
import { createDeterministicVector } from '../../helpers/fixtures';

describe('cosineSimilarity', () => {
  describe('edge cases', () => {
    it('returns 0 for empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it('throws for mismatched lengths', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
    });

    it('returns 1 for identical normalized vectors', () => {
      const v = createDeterministicVector(42);
      expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBe(0);
    });
  });

  describe('normal operation', () => {
    it('returns higher similarity for similar vectors', () => {
      const a = createDeterministicVector(1);
      const b = createDeterministicVector(2); // Different but somewhat similar
      const c = createDeterministicVector(100); // Very different

      const simAB = cosineSimilarity(a, b);
      const simAC = cosineSimilarity(a, c);

      // Similar seeds should produce more similar vectors
      expect(simAB).toBeGreaterThan(simAC);
    });

    it('is commutative', () => {
      const a = createDeterministicVector(1);
      const b = createDeterministicVector(2);

      expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
    });
  });
});

describe('maxSimilarity', () => {
  it('returns 0 for empty selected set', () => {
    const candidate = createDeterministicVector(1);
    expect(maxSimilarity(candidate, [])).toBe(0);
  });

  it('returns max similarity across all selected', () => {
    const candidate = createDeterministicVector(1);
    const selected = [
      createDeterministicVector(2), // Some similarity
      createDeterministicVector(1), // Same as candidate (max)
      createDeterministicVector(100) // Low similarity
    ];

    const result = maxSimilarity(candidate, selected);
    expect(result).toBeCloseTo(1, 5); // Should find the identical one
  });
});
```

### Pattern 3: Normalization Tests

```typescript
// tests/core/retrieval/algorithms/normalize.test.ts

import { describe, it, expect } from 'bun:test';
import {
  minMaxNormalize,
  zScoreNormalize
} from '@/core/retrieval/algorithms/normalize';
import { createScoredItem } from '../../helpers/fixtures';

describe('minMaxNormalize', () => {
  it('returns empty array for empty input', () => {
    expect(minMaxNormalize([])).toEqual([]);
  });

  it('returns score 1 for single item', () => {
    const items = [createScoredItem('1', 0.5)];
    const result = minMaxNormalize(items);
    expect(result[0].score).toBe(1);
  });

  it('normalizes to [0, 1] range', () => {
    const items = [
      createScoredItem('1', 10),
      createScoredItem('2', 50),
      createScoredItem('3', 100)
    ];

    const result = minMaxNormalize(items);

    expect(result.find((r) => r.id === '1')?.score).toBe(0);
    expect(result.find((r) => r.id === '2')?.score).toBeCloseTo(0.444, 2);
    expect(result.find((r) => r.id === '3')?.score).toBe(1);
  });

  it('handles all identical scores', () => {
    const items = [
      createScoredItem('1', 0.5),
      createScoredItem('2', 0.5),
      createScoredItem('3', 0.5)
    ];

    const result = minMaxNormalize(items);

    // All should be 1 (or could be any constant)
    expect(result.every((r) => r.score === 1)).toBe(true);
  });

  it('preserves item properties', () => {
    const items = [
      { id: '1', score: 10, extra: 'data' },
      { id: '2', score: 20, extra: 'more' }
    ];

    const result = minMaxNormalize(items);

    expect(result[0].extra).toBe('data');
    expect(result[1].extra).toBe('more');
  });
});
```

### Pattern 4: Fusion Tests

```typescript
// tests/core/retrieval/algorithms/fusion.test.ts

import { describe, it, expect } from 'bun:test';
import { fuseSearchResults } from '@/core/retrieval/algorithms/fusion';
import { createScoredItem } from '../../helpers/fixtures';

describe('fuseSearchResults', () => {
  describe('edge cases', () => {
    it('returns empty array for empty inputs', () => {
      expect(fuseSearchResults([], [])).toEqual([]);
    });

    it('returns vector results when text is empty', () => {
      const vector = [createScoredItem('1', 0.9)];
      const result = fuseSearchResults(vector, []);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('returns text results when vector is empty', () => {
      const text = [createScoredItem('1', 0.8)];
      const result = fuseSearchResults([], text);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });

  describe('fusion logic', () => {
    it('combines items appearing in both sources', () => {
      const vector = [createScoredItem('shared', 0.9)];
      const text = [createScoredItem('shared', 0.8)];

      const result = fuseSearchResults(vector, text);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('shared');
      // Combined score should be higher than either alone
      expect(result[0].score).toBeGreaterThan(0);
    });

    it('includes items from both sources', () => {
      const vector = [createScoredItem('v1', 0.9)];
      const text = [createScoredItem('t1', 0.8)];

      const result = fuseSearchResults(vector, text);

      expect(result).toHaveLength(2);
      expect(result.find((r) => r.id === 'v1')).toBeDefined();
      expect(result.find((r) => r.id === 't1')).toBeDefined();
    });

    it('ranks items by fused score', () => {
      const vector = [createScoredItem('1', 1.0), createScoredItem('2', 0.5)];
      const text = [createScoredItem('1', 0.5), createScoredItem('2', 1.0)];

      const result = fuseSearchResults(vector, text, {
        vectorWeight: 0.5,
        textWeight: 0.5
      });

      // Both should have similar fused scores since weights are equal
      const score1 = result.find((r) => r.id === '1')?.score ?? 0;
      const score2 = result.find((r) => r.id === '2')?.score ?? 0;
      expect(Math.abs(score1 - score2)).toBeLessThan(0.1);
    });
  });

  describe('configuration', () => {
    it('respects custom weights', () => {
      const vector = [createScoredItem('1', 1.0)];
      const text = [createScoredItem('1', 0.0)];

      // 100% vector weight
      const result = fuseSearchResults(vector, text, {
        vectorWeight: 1.0,
        textWeight: 0.0,
        coveragePenalty: false
      });

      expect(result[0].score).toBeCloseTo(1.0, 1);
    });
  });
});
```

### Pattern 5: Schema Validation Tests

```typescript
// tests/core/consolidation/schemas.test.ts

import { describe, it, expect } from 'bun:test';
import {
  entityExtractionSchema,
  memoryDecisionSchema
} from '@/core/consolidation/schemas';

describe('entityExtractionSchema', () => {
  it('validates correct entity extraction', () => {
    const valid = {
      entities: [
        {
          name: 'TypeScript',
          type: 'Technology',
          description: 'A typed superset of JavaScript',
          isWellKnown: true
        }
      ],
      userFacts: ['Prefers TypeScript']
    };

    const result = entityExtractionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid entity type', () => {
    const invalid = {
      entities: [
        {
          name: 'Test',
          type: 'InvalidType', // Not in enum
          description: 'Test',
          isWellKnown: false
        }
      ]
    };

    const result = entityExtractionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('allows empty entities array', () => {
    const valid = { entities: [] };
    const result = entityExtractionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe('memoryDecisionSchema', () => {
  it('validates ADD decision', () => {
    const valid = {
      decisions: [
        {
          extractedMemoryIndex: 0,
          action: 'ADD',
          reason: 'New information'
        }
      ]
    };

    const result = memoryDecisionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('validates INVALIDATE decision with target', () => {
    const valid = {
      decisions: [
        {
          extractedMemoryIndex: 0,
          action: 'INVALIDATE',
          reason: 'Supersedes old info',
          invalidates: [{ existingMemoryId: 'abc-123', reason: 'Changed jobs' }]
        }
      ]
    };

    const result = memoryDecisionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid action', () => {
    const invalid = {
      decisions: [
        {
          extractedMemoryIndex: 0,
          action: 'DELETE', // Not valid
          reason: 'Test'
        }
      ]
    };

    const result = memoryDecisionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
```

### Pattern 6: Mocking Dependencies

```typescript
// tests/core/retrieval/phases/land.test.ts

import { describe, it, expect, mock } from 'bun:test';
import { land } from '@/core/retrieval/phases/land';
import { createScoredItem, createMockVector } from '../../../helpers/fixtures';

describe('land phase', () => {
  it('runs vector and text search in parallel', async () => {
    const mockGraphClient = {
      searchVector: mock(() =>
        Promise.resolve([
          createScoredItem('v1', 0.9),
          createScoredItem('v2', 0.8)
        ])
      ),
      searchFulltext: mock(() =>
        Promise.resolve([
          createScoredItem('t1', 0.85),
          createScoredItem('v1', 0.7) // Overlap with vector
        ])
      )
    };

    const result = await land(
      {
        query: 'test query',
        queryEmbedding: createMockVector()
      },
      { graphClient: mockGraphClient as any }
    );

    // Both search methods called
    expect(mockGraphClient.searchVector).toHaveBeenCalled();
    expect(mockGraphClient.searchFulltext).toHaveBeenCalled();

    // Results fused
    expect(result.memories.length).toBeGreaterThan(0);
    expect(result.metadata.vectorCount).toBe(2);
    expect(result.metadata.textCount).toBe(2);
  });

  it('handles empty search results', async () => {
    const mockGraphClient = {
      searchVector: mock(() => Promise.resolve([])),
      searchFulltext: mock(() => Promise.resolve([]))
    };

    const result = await land(
      { query: 'test', queryEmbedding: createMockVector() },
      { graphClient: mockGraphClient as any }
    );

    expect(result.memories).toEqual([]);
    expect(result.metadata.fusedCount).toBe(0);
  });
});
```

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test fusion

# Run tests matching pattern
bun test --grep "edge cases"

# Watch mode
bun test --watch

# With coverage
bun test --coverage
```

## Test Checklist

For each component, ensure:

- [ ] **Edge cases**: Empty input, single item, all identical values
- [ ] **Normal operation**: Typical inputs produce expected outputs
- [ ] **Configuration**: Options/config are respected
- [ ] **Error handling**: Invalid inputs handled gracefully
- [ ] **Deterministic**: Same input produces same output
- [ ] **Isolated**: Tests don't depend on each other

## Validation

```bash
bun run typecheck
bun test
```

All tests should pass with no flaky failures.
