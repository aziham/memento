/**
 * Test Fixtures
 *
 * Shared test data for unit tests across the Memento codebase.
 * Keep these minimal and focused on what each test category needs.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Vector Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

/** Unit vector pointing in positive x direction */
export const UNIT_VECTOR_X = [1, 0, 0];

/** Unit vector pointing in positive y direction */
export const UNIT_VECTOR_Y = [0, 1, 0];

/** Zero vector */
export const ZERO_VECTOR = [0, 0, 0];

/** Non-normalized vector for L2 normalization tests */
export const UNNORMALIZED_VECTOR = [3, 4, 0]; // magnitude = 5

/** Already normalized vector (magnitude = 1) */
export const NORMALIZED_VECTOR = [0.6, 0.8, 0]; // 3/5, 4/5, 0

// ═══════════════════════════════════════════════════════════════════════════════
// Score Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

/** Typical vector search scores (tight distribution) */
export const VECTOR_SCORES = [0.89, 0.85, 0.82, 0.78, 0.75];

/** Typical BM25 fulltext scores (wide distribution) */
export const FULLTEXT_SCORES = [52.3, 28.7, 18.2, 8.5, 3.2];

/** All identical scores (edge case) */
export const IDENTICAL_SCORES = [0.5, 0.5, 0.5, 0.5];

/** Single score (edge case) */
export const SINGLE_SCORE = [0.75];

// ═══════════════════════════════════════════════════════════════════════════════
// Config Fixtures
// ═══════════════════════════════════════════════════════════��═══════════════════

/** Valid minimal config for testing */
export const VALID_MINIMAL_CONFIG = {
  proxy: {
    provider: 'openai' as const
  },
  llm: {
    provider: 'openai' as const,
    apiKey: 'sk-test-key',
    defaults: {
      model: 'gpt-4o-mini'
    }
  },
  embedding: {
    provider: 'openai' as const,
    apiKey: 'sk-test-key',
    model: 'text-embedding-3-small',
    dimensions: 1536
  }
};

/** Valid custom provider config */
export const VALID_CUSTOM_PROVIDER_CONFIG = {
  proxy: {
    provider: 'custom' as const,
    baseUrl: 'https://api.example.com',
    protocol: 'openai' as const,
    providerName: 'Example'
  },
  llm: {
    provider: 'openai-compatible' as const,
    baseUrl: 'https://api.example.com/v1',
    defaults: {
      model: 'custom-model'
    }
  },
  embedding: {
    provider: 'openai-compatible' as const,
    baseUrl: 'https://api.example.com/v1',
    model: 'custom-embedding',
    dimensions: 768
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Entity Fixtures
// ════════════════════��══════════════════════════════════════════════════════════

/** Sample entity for testing */
export function createMockEntity(
  overrides?: Partial<{
    id: string;
    name: string;
    type: string;
    description: string | null;
    embedding: number[] | null;
    isWellKnown: boolean;
    degree: number;
  }>
) {
  return {
    id: overrides?.id ?? 'entity-1',
    name: overrides?.name ?? 'Bun',
    type: overrides?.type ?? 'Technology',
    description: overrides?.description ?? 'A JavaScript runtime and toolkit',
    embedding: overrides?.embedding ?? [0.1, 0.2, 0.3],
    isWellKnown: overrides?.isWellKnown ?? false,
    degree: overrides?.degree ?? 10,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Memory Fixtures
// ═══════════════════════════════════════════════════════════════════��═══════════

/** Sample memory for testing */
export function createMockMemory(
  overrides?: Partial<{
    id: string;
    content: string;
    embedding: number[] | null;
  }>
) {
  return {
    id: overrides?.id ?? 'memory-1',
    content: overrides?.content ?? 'User prefers Bun over Node.js for TypeScript projects',
    embedding: overrides?.embedding ?? [0.1, 0.2, 0.3],
    created_at: '2026-01-01T00:00:00.000Z',
    valid_at: '2026-01-01T00:00:00.000Z',
    invalid_at: null
  };
}

/** Create a scored memory for retrieval tests */
export function createScoredMemory(id: string, score: number, embedding?: number[]) {
  return {
    result: createMockMemory({ id, embedding }),
    score,
    source: 'vector' as const
  };
}
