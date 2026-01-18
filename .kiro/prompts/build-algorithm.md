---
description: Implement a retrieval or scoring algorithm
argument-hint: [algorithm-name]
---

# Build Algorithm: $ARGUMENTS

## Objective

Implement the `$ARGUMENTS` algorithm for Memento's retrieval pipeline. Algorithms are pure functions that transform, score, rank, or filter data.

## Algorithm Categories

### Similarity Algorithms

Calculate distance/similarity between vectors.

### Normalization Algorithms

Transform scores to comparable scales.

### Fusion Algorithms

Combine scores from multiple sources.

### Diversity Algorithms

Reduce redundancy in results (MMR).

### Ranking Algorithms

Weight and rank items by multiple signals.

## Algorithm Design Principles

1. **Pure functions** - No side effects, same input → same output
2. **Handle edge cases** - Empty arrays, single items, division by zero
3. **Type safe** - Full TypeScript types for inputs and outputs
4. **Testable** - Easy to unit test with known inputs/outputs
5. **Performant** - O(n) or O(n log n), avoid O(n²) when possible

## Core Algorithms

### Cosine Similarity

Measures angle between two vectors. Returns 0-1 for normalized vectors.

```typescript
// src/core/retrieval/algorithms/similarity.ts

/**
 * Calculate cosine similarity between two vectors.
 * Assumes vectors are L2-normalized (magnitude = 1).
 * Returns value in range [0, 1] for normalized vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) return 0;

  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }

  // For L2-normalized vectors, dot product IS cosine similarity
  return dotProduct;
}

/**
 * Calculate max similarity between a candidate and a set of selected items.
 * Used by MMR to penalize redundancy.
 */
export function maxSimilarity(
  candidate: number[],
  selected: number[][]
): number {
  if (selected.length === 0) return 0;

  let max = -Infinity;
  for (const s of selected) {
    const sim = cosineSimilarity(candidate, s);
    if (sim > max) max = sim;
  }
  return max;
}
```

### Score Normalization

Transform scores to [0, 1] range for fair comparison.

```typescript
// src/core/retrieval/algorithms/normalize.ts

export interface ScoredItem {
  id: string;
  score: number;
}

/**
 * Min-max normalization to [0, 1] range.
 * Handles edge cases: empty array, single item, all same scores.
 */
export function minMaxNormalize<T extends ScoredItem>(items: T[]): T[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ ...items[0], score: 1 }];

  const scores = items.map((i) => i.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;

  // All scores identical
  if (range === 0) {
    return items.map((i) => ({ ...i, score: 1 }));
  }

  return items.map((i) => ({
    ...i,
    score: (i.score - min) / range
  }));
}

/**
 * Z-score normalization (mean=0, std=1).
 * Useful for comparing distributions with different scales.
 */
export function zScoreNormalize<T extends ScoredItem>(items: T[]): T[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ ...items[0], score: 0 }];

  const scores = items.map((i) => i.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const std = Math.sqrt(variance);

  if (std === 0) {
    return items.map((i) => ({ ...i, score: 0 }));
  }

  return items.map((i) => ({
    ...i,
    score: (i.score - mean) / std
  }));
}
```

### Search Fusion

Combine vector search and fulltext search results.

```typescript
// src/core/retrieval/algorithms/fusion.ts

export interface FusionOptions {
  vectorWeight?: number; // Default: 0.7
  textWeight?: number; // Default: 0.3
  coveragePenalty?: boolean; // Penalize single-source dominance
}

/**
 * Fuse vector and fulltext search results into a single ranked list.
 *
 * Strategy:
 * 1. Align score distributions (z-score normalize)
 * 2. Scale to [0, 1] (min-max normalize)
 * 3. Apply coverage penalty if one source dominates
 * 4. Weighted average of scores
 */
export function fuseSearchResults<T extends ScoredItem>(
  vectorResults: T[],
  textResults: T[],
  options: FusionOptions = {}
): T[] {
  const {
    vectorWeight = 0.7,
    textWeight = 0.3,
    coveragePenalty = true
  } = options;

  // Edge cases
  if (vectorResults.length === 0 && textResults.length === 0) {
    return [];
  }
  if (vectorResults.length === 0) {
    return minMaxNormalize(textResults);
  }
  if (textResults.length === 0) {
    return minMaxNormalize(vectorResults);
  }

  // Step 1: Normalize each source independently
  const normVector = minMaxNormalize(zScoreNormalize(vectorResults));
  const normText = minMaxNormalize(zScoreNormalize(textResults));

  // Step 2: Build lookup maps
  const vectorMap = new Map(normVector.map((r) => [r.id, r.score]));
  const textMap = new Map(normText.map((r) => [r.id, r.score]));

  // Step 3: Collect all unique IDs
  const allIds = new Set([...vectorMap.keys(), ...textMap.keys()]);

  // Step 4: Calculate fused scores
  const fused: T[] = [];
  for (const id of allIds) {
    const vScore = vectorMap.get(id) ?? 0;
    const tScore = textMap.get(id) ?? 0;

    // Coverage penalty: reduce weight if item only in one source
    let vw = vectorWeight;
    let tw = textWeight;
    if (coveragePenalty) {
      const inVector = vectorMap.has(id);
      const inText = textMap.has(id);
      if (inVector && !inText) {
        vw = vectorWeight * 0.8; // Penalize single-source
        tw = 0;
      } else if (!inVector && inText) {
        vw = 0;
        tw = textWeight * 0.8;
      }
    }

    const fusedScore = vw * vScore + tw * tScore;

    // Get original item data
    const original =
      normVector.find((r) => r.id === id) ?? normText.find((r) => r.id === id)!;

    fused.push({ ...original, score: fusedScore });
  }

  // Step 5: Sort by fused score descending
  return fused.sort((a, b) => b.score - a.score);
}
```

### Maximal Marginal Relevance (MMR)

Select diverse results while maintaining relevance.

```typescript
// src/core/retrieval/algorithms/mmr.ts

export interface MMROptions {
  lambda?: number; // 0-1, higher = favor relevance, lower = favor diversity
  limit?: number; // Max items to select
}

export interface EmbeddedItem extends ScoredItem {
  embedding: number[];
}

/**
 * Maximal Marginal Relevance for diversity filtering.
 *
 * MMR(d) = λ * relevance(d) - (1-λ) * max_similarity(d, selected)
 *
 * Iteratively selects items that are relevant but not redundant
 * with already-selected items.
 */
export function mmrSelect<T extends EmbeddedItem>(
  items: T[],
  options: MMROptions = {}
): T[] {
  const { lambda = 0.7, limit = 10 } = options;

  if (items.length === 0) return [];
  if (items.length <= limit) return items;

  // Normalize scores to [0, 1]
  const normalized = minMaxNormalize(items);

  const selected: T[] = [];
  const selectedEmbeddings: number[][] = [];
  const remaining = new Set(normalized.map((_, i) => i));

  while (selected.length < limit && remaining.size > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (const idx of remaining) {
      const item = normalized[idx];
      const relevance = item.score;

      // Calculate max similarity to already selected
      const redundancy = maxSimilarity(item.embedding, selectedEmbeddings);

      // MMR score
      const mmrScore = lambda * relevance - (1 - lambda) * redundancy;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = idx;
      }
    }

    if (bestIdx === -1) break;

    selected.push(normalized[bestIdx]);
    selectedEmbeddings.push(normalized[bestIdx].embedding);
    remaining.delete(bestIdx);
  }

  return selected;
}

/**
 * Adaptive MMR: adjust lambda based on score distribution.
 * If there's a clear winner, favor relevance.
 * If scores are similar, favor diversity.
 */
export function adaptiveMMRSelect<T extends EmbeddedItem>(
  items: T[],
  options: Omit<MMROptions, 'lambda'> = {}
): T[] {
  if (items.length === 0) return [];

  // Calculate score gap
  const scores = items.map((i) => i.score);
  const topScore = Math.max(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const gap = topScore - avgScore;

  // Adapt lambda based on gap
  let lambda: number;
  if (gap > 0.3) {
    lambda = 0.8; // Clear winner, favor relevance
  } else if (gap > 0.2) {
    lambda = 0.7;
  } else if (gap > 0.1) {
    lambda = 0.6;
  } else {
    lambda = 0.5; // Many similar, favor diversity
  }

  return mmrSelect(items, { ...options, lambda });
}
```

### Multi-Signal Entity Weighting

Weight entities by multiple signals for PageRank personalization.

```typescript
// src/core/retrieval/algorithms/weights.ts

export interface EntityWeightInput {
  entityId: string;
  entityEmbedding: number[];
  memoryEmbeddings: number[][]; // Embeddings of memories about this entity
  degree: number; // Number of edges
}

export interface WeightConfig {
  semanticWeight?: number; // Default: 0.5
  memoryWeight?: number; // Default: 0.3
  structuralWeight?: number; // Default: 0.2
}

/**
 * Calculate entity weight using multiple signals:
 * 1. Semantic: cosine(entity embedding, query embedding)
 * 2. Memory-based: avg cosine of memories about entity
 * 3. Structural: log-normalized degree centrality
 */
export function calculateEntityWeight(
  entity: EntityWeightInput,
  queryEmbedding: number[],
  maxDegree: number,
  config: WeightConfig = {}
): number {
  const {
    semanticWeight = 0.5,
    memoryWeight = 0.3,
    structuralWeight = 0.2
  } = config;

  // Signal 1: Direct semantic similarity
  const semanticScore = cosineSimilarity(
    entity.entityEmbedding,
    queryEmbedding
  );

  // Signal 2: Memory-based similarity
  let memoryScore = 0;
  if (entity.memoryEmbeddings.length > 0) {
    const similarities = entity.memoryEmbeddings.map((m) =>
      cosineSimilarity(m, queryEmbedding)
    );
    memoryScore = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  }

  // Signal 3: Structural importance (log-normalized degree)
  const structuralScore =
    maxDegree > 1
      ? Math.log(1 + entity.degree) / Math.log(1 + maxDegree)
      : entity.degree > 0
        ? 1
        : 0;

  // Weighted combination
  return (
    semanticWeight * semanticScore +
    memoryWeight * memoryScore +
    structuralWeight * structuralScore
  );
}

/**
 * Normalize weights to sum to 1 for PPR personalization.
 */
export function normalizeWeights(
  weights: Map<string, number>
): Map<string, number> {
  const total = Array.from(weights.values()).reduce((a, b) => a + b, 0);

  if (total === 0) return weights;

  const normalized = new Map<string, number>();
  for (const [id, weight] of weights) {
    normalized.set(id, weight / total);
  }
  return normalized;
}
```

## File Structure

```
src/core/retrieval/algorithms/
├── similarity.ts   # cosineSimilarity, maxSimilarity
├── normalize.ts    # minMaxNormalize, zScoreNormalize
├── fusion.ts       # fuseSearchResults
├── mmr.ts          # mmrSelect, adaptiveMMRSelect
├── weights.ts      # calculateEntityWeight, normalizeWeights
└── index.ts        # Re-export all
```

## Testing Template

Every algorithm needs unit tests:

```typescript
// tests/core/retrieval/algorithms/fusion.test.ts

import { describe, it, expect } from 'bun:test';
import { fuseSearchResults } from '@/core/retrieval/algorithms/fusion';

describe('fuseSearchResults', () => {
  it('returns empty array for empty inputs', () => {
    expect(fuseSearchResults([], [])).toEqual([]);
  });

  it('handles vector-only results', () => {
    const vector = [{ id: '1', score: 0.9 }];
    const result = fuseSearchResults(vector, []);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(1); // Normalized to 1
  });

  it('combines scores with default weights', () => {
    const vector = [{ id: '1', score: 1.0 }];
    const text = [{ id: '1', score: 1.0 }];
    const result = fuseSearchResults(vector, text);
    expect(result[0].score).toBeCloseTo(1.0, 2);
  });

  it('applies coverage penalty for single-source items', () => {
    const vector = [{ id: '1', score: 1.0 }];
    const text = [{ id: '2', score: 1.0 }];
    const result = fuseSearchResults(vector, text, { coveragePenalty: true });
    // Both should be penalized since they're single-source
    expect(result[0].score).toBeLessThan(1.0);
  });
});
```

## Validation

```bash
bun run typecheck
bun test algorithms
```

## Checklist

- [ ] Pure function with no side effects
- [ ] Edge cases handled (empty, single, identical scores)
- [ ] TypeScript types for inputs and outputs
- [ ] Exported from index.ts
- [ ] Unit tests with good coverage
- [ ] Performance considered (avoid O(n²) if possible)
