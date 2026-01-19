---
description: Add a new phase to retrieval or consolidation pipeline
argument-hint: [pipeline] [phase-name]
---

# Build Pipeline Phase: $ARGUMENTS

## Objective

Add the `$2` phase to the `$1` pipeline. Phases are the building blocks of Memento's processing pipelines - each transforms data and passes results to the next phase.

## Pipeline Architecture

Memento has two pipelines:

### Retrieval Pipeline

Retrieves relevant memories for a query. Five phases:

```
LAND → ANCHOR → EXPAND → DISTILL → TRACE
```

| Phase   | Input             | Output               | Purpose                           |
| ------- | ----------------- | -------------------- | --------------------------------- |
| LAND    | Query + embedding | Seed memories (100)  | Cast wide net via hybrid search   |
| ANCHOR  | Seed memories     | Weighted entities    | Find anchor points for graph walk |
| EXPAND  | Anchors + query   | Graph memories (100) | SEM-PPR graph traversal           |
| DISTILL | All memories      | Top 10 diverse       | Fuse signals + MMR diversity      |
| TRACE   | Top memories      | RetrievalOutput      | Enrich with graph context         |

### Consolidation Pipeline

Stores new memories from notes. Two parallel branches + join:

```
         ┌──► Branch A: Retrieve Context ───────────────┐
Note ────┤                                              ├──► Join ──► Write
         └──► Branch B: Extract Entities & Memories ────┘
```

| Phase             | Purpose                                      |
| ----------------- | -------------------------------------------- |
| Embed Note        | Generate embedding for retrieval             |
| Retrieve Context  | Find related existing memories               |
| HyDE Augmentation | Generate hypothetical docs for better search |
| Extract Entities  | LLM extracts entities from note              |
| Search Entities   | Find matching existing entities              |
| Resolve Entities  | LLM decides CREATE or MATCH                  |
| Extract Memories  | LLM extracts memories from note              |
| Resolve Memories  | LLM decides ADD, SKIP, or INVALIDATE         |
| Write Graph       | Persist nodes and edges to Neo4j             |

## Phase Design Pattern

### Type Definitions

```typescript
// src/core/retrieval/types.ts

// Phase input
export interface LandInput {
  query: string;
  queryEmbedding: number[];
}

// Phase output
export interface LandOutput {
  memories: ScoredMemory[];
  metadata: {
    vectorCount: number;
    textCount: number;
    fusedCount: number;
    durationMs: number;
  };
}

// Phase configuration
export interface LandConfig {
  vectorLimit?: number; // Default: 100
  textLimit?: number; // Default: 100
  vectorWeight?: number; // Default: 0.7
  textWeight?: number; // Default: 0.3
}

// Phase dependencies
export interface LandDeps {
  graphClient: GraphClient;
}
```

### Phase Implementation

```typescript
// src/core/retrieval/phases/land.ts

import type { GraphClient } from '@/providers/graph';
import type { LandInput, LandOutput, LandConfig, ScoredMemory } from '../types';
import { fuseSearchResults } from '../algorithms/fusion';

const defaultConfig: Required<LandConfig> = {
  vectorLimit: 100,
  textLimit: 100,
  vectorWeight: 0.7,
  textWeight: 0.3
};

export interface LandDeps {
  graphClient: GraphClient;
}

/**
 * LAND Phase: Cast wide net with hybrid search.
 *
 * Combines vector similarity search (semantic) with fulltext search (keyword)
 * using distribution-aligned fusion to find seed memories.
 */
export async function land(
  input: LandInput,
  deps: LandDeps,
  config: LandConfig = {}
): Promise<LandOutput> {
  const startTime = performance.now();
  const cfg = { ...defaultConfig, ...config };
  const { graphClient } = deps;

  // Run vector and fulltext search in parallel
  const [vectorResults, textResults] = await Promise.all([
    graphClient.searchVector('Memory', input.queryEmbedding, cfg.vectorLimit),
    graphClient.searchFulltext('memory_fulltext', input.query, cfg.textLimit)
  ]);

  // Fuse results
  const fused = fuseSearchResults(vectorResults, textResults, {
    vectorWeight: cfg.vectorWeight,
    textWeight: cfg.textWeight,
    coveragePenalty: true
  });

  return {
    memories: fused,
    metadata: {
      vectorCount: vectorResults.length,
      textCount: textResults.length,
      fusedCount: fused.length,
      durationMs: performance.now() - startTime
    }
  };
}
```

### Pipeline Orchestrator

```typescript
// src/core/retrieval/pipeline.ts

import type { GraphClient } from '@/providers/graph';
import type { EmbeddingClient } from '@/providers/embedding';
import { land } from './phases/land';
import { anchor } from './phases/anchor';
import { expand } from './phases/expand';
import { distill } from './phases/distill';
import { trace } from './phases/trace';

export interface RetrievalInput {
  query: string;
  queryEmbedding: number[];
}

export interface RetrievalDeps {
  graphClient: GraphClient;
  embeddingClient: EmbeddingClient;
}

export interface RetrievalOptions {
  land?: LandConfig;
  anchor?: AnchorConfig;
  expand?: ExpandConfig;
  distill?: DistillConfig;
  trace?: TraceConfig;
}

/**
 * Run the full retrieval pipeline.
 *
 * LAND → ANCHOR → EXPAND → DISTILL → TRACE
 */
export async function retrieve(
  input: RetrievalInput,
  deps: RetrievalDeps,
  options: RetrievalOptions = {}
): Promise<RetrievalOutput> {
  const { graphClient, embeddingClient } = deps;

  // Phase 1: LAND - Cast wide net
  const landResult = await land(
    { query: input.query, queryEmbedding: input.queryEmbedding },
    { graphClient },
    options.land
  );

  // Phase 2: ANCHOR - Find anchor entities
  const anchorResult = await anchor(
    { memories: landResult.memories, queryEmbedding: input.queryEmbedding },
    { graphClient, embeddingClient },
    options.anchor
  );

  // Phase 3: EXPAND - Graph traversal via SEM-PPR
  const expandResult = await expand(
    { anchors: anchorResult.anchors, queryEmbedding: input.queryEmbedding },
    { graphClient },
    options.expand
  );

  // Phase 4: DISTILL - Fuse and diversify
  const distillResult = await distill(
    {
      landMemories: landResult.memories,
      expandMemories: expandResult.memories
    },
    { embeddingClient },
    options.distill
  );

  // Phase 5: TRACE - Enrich with context
  const traceResult = await trace(
    { memories: distillResult.memories },
    { graphClient },
    options.trace
  );

  return traceResult;
}
```

## Retrieval Phase Templates

### ANCHOR Phase

```typescript
// src/core/retrieval/phases/anchor.ts

/**
 * ANCHOR Phase: Find anchor entities for graph traversal.
 *
 * For each seed memory, extract entities it's ABOUT.
 * Weight entities using multi-signal scoring:
 * - Semantic similarity to query
 * - Average similarity of memories about entity
 * - Structural importance (degree centrality)
 */
export async function anchor(
  input: AnchorInput,
  deps: AnchorDeps,
  config: AnchorConfig = {}
): Promise<AnchorOutput> {
  const { memories, queryEmbedding } = input;
  const { graphClient } = deps;

  // Get entities from seed memories
  const entityIds = new Set<string>();
  for (const memory of memories) {
    const entities = await graphClient.getMemoryEntities(memory.id);
    for (const e of entities) {
      entityIds.add(e.id);
    }
  }

  // Calculate weights for each entity
  const weights = new Map<string, number>();
  for (const entityId of entityIds) {
    const entity = await graphClient.getEntity(entityId);
    const memoryEmbeddings =
      await graphClient.getEntityMemoryEmbeddings(entityId);

    const weight = calculateEntityWeight(
      {
        entityId,
        entityEmbedding: entity.embedding,
        memoryEmbeddings,
        degree: entity.degree
      },
      queryEmbedding,
      maxDegree,
      config.weights
    );

    weights.set(entityId, weight);
  }

  // Normalize weights to sum to 1
  const normalizedWeights = normalizeWeights(weights);

  return {
    anchors: Array.from(normalizedWeights.entries()).map(([id, weight]) => ({
      entityId: id,
      weight
    })),
    metadata: { entityCount: entityIds.size }
  };
}
```

### EXPAND Phase (SEM-PPR)

```typescript
// src/core/retrieval/phases/expand.ts

/**
 * EXPAND Phase: Walk graph outward from anchors.
 *
 * Uses SEM-PPR (Semantic-Enhanced Personalized PageRank):
 * 1. Run PPR from anchor entities
 * 2. Boost results with semantic similarity to query
 *
 * hybridScore = α × structureScore + (1-α) × semanticScore
 */
export async function expand(
  input: ExpandInput,
  deps: ExpandDeps,
  config: ExpandConfig = {}
): Promise<ExpandOutput> {
  const { anchors, queryEmbedding } = input;
  const { graphClient } = deps;
  const { structuralWeight = 0.5, limit = 100 } = config;

  // Run Personalized PageRank
  const anchorIds = anchors.map((a) => a.entityId);
  const pprResults = await graphClient.runPersonalizedPageRank(
    anchorIds,
    0.75, // damping factor
    25 // iterations
  );

  // Apply semantic boost
  const boosted = pprResults.map((result) => {
    const structureScore = result.score;
    const semanticScore = cosineSimilarity(result.embedding, queryEmbedding);

    const hybridScore =
      structuralWeight * structureScore +
      (1 - structuralWeight) * semanticScore;

    return { ...result, score: hybridScore };
  });

  // Sort by hybrid score and limit
  const sorted = boosted.sort((a, b) => b.score - a.score).slice(0, limit);

  return {
    memories: sorted,
    metadata: { pprResultCount: pprResults.length }
  };
}
```

### DISTILL Phase

```typescript
// src/core/retrieval/phases/distill.ts

/**
 * DISTILL Phase: Fuse signals and select diverse results.
 *
 * 1. Fuse LAND results (hybrid search) with EXPAND results (graph walk)
 * 2. Apply adaptive MMR for diversity
 */
export async function distill(
  input: DistillInput,
  deps: DistillDeps,
  config: DistillConfig = {}
): Promise<DistillOutput> {
  const { landMemories, expandMemories } = input;
  const { limit = 10 } = config;

  // Fuse LAND and EXPAND results
  const fused = fuseSearchResults(landMemories, expandMemories, {
    vectorWeight: 0.7,
    textWeight: 0.3
  });

  // Apply adaptive MMR for diversity
  const diverse = adaptiveMMRSelect(fused, { limit });

  return {
    memories: diverse,
    metadata: {
      fusedCount: fused.length,
      selectedCount: diverse.length
    }
  };
}
```

### TRACE Phase

```typescript
// src/core/retrieval/phases/trace.ts

/**
 * TRACE Phase: Build rich output with graph context.
 *
 * For each selected memory:
 * - Fetch entities it's ABOUT
 * - Fetch invalidation history (2 hops)
 * - Fetch provenance (source Note)
 */
export async function trace(
  input: TraceInput,
  deps: TraceDeps,
  config: TraceConfig = {}
): Promise<TraceOutput> {
  const { memories } = input;
  const { graphClient } = deps;

  const enriched = await Promise.all(
    memories.map(async (memory) => {
      const [entities, history, provenance] = await Promise.all([
        graphClient.getMemoryEntities(memory.id),
        graphClient.getInvalidationChain(memory.id, 2),
        graphClient.getMemoryProvenance(memory.id)
      ]);

      return {
        ...memory,
        entities,
        history,
        provenance
      };
    })
  );

  return {
    memories: enriched,
    metadata: { count: enriched.length }
  };
}
```

## Consolidation Phase Templates

### Extract Entities Phase (LLM)

```typescript
// src/core/consolidation/phases/extract-entities.ts

import { z } from 'zod';

const entitySchema = z.object({
  name: z.string(),
  type: z.enum([
    'Person',
    'Organization',
    'Project',
    'Technology',
    'Location',
    'Event',
    'Concept'
  ]),
  description: z.string(),
  isWellKnown: z.boolean()
});

const extractionSchema = z.object({
  entities: z.array(entitySchema),
  userFacts: z.array(z.string()).optional()
});

/**
 * Extract entities from note content using LLM.
 */
export async function extractEntities(
  input: ExtractEntitiesInput,
  deps: ExtractEntitiesDeps
): Promise<ExtractEntitiesOutput> {
  const { content, userName } = input;
  const { llmClient } = deps;

  const prompt = `
Extract all named entities from this note. For each entity, provide:
- name: The entity's name
- type: One of Person, Organization, Project, Technology, Location, Event, Concept
- description: A brief description
- isWellKnown: true if this is a famous/public entity

Note from ${userName}:
"""
${content}
"""

Also extract any biographical facts about the user (${userName}).
`;

  const result = await llmClient.generateObject({
    prompt,
    schema: extractionSchema,
    schemaName: 'EntityExtraction'
  });

  return {
    entities: result.entities,
    userFacts: result.userFacts ?? []
  };
}
```

### Resolve Memories Phase (LLM)

```typescript
// src/core/consolidation/phases/resolve-memories.ts

const decisionSchema = z.object({
  decisions: z.array(
    z.object({
      extractedMemoryIndex: z.number(),
      action: z.enum(['ADD', 'SKIP', 'INVALIDATE']),
      reason: z.string(),
      invalidates: z
        .array(
          z.object({
            existingMemoryId: z.string(),
            reason: z.string()
          })
        )
        .optional()
    })
  )
});

/**
 * Resolve extracted memories against existing memories.
 *
 * LLM sees ALL extracted + ALL existing memories in one context,
 * decides for each: ADD (new), SKIP (duplicate), INVALIDATE (supersedes).
 */
export async function resolveMemories(
  input: ResolveMemoriesInput,
  deps: ResolveMemoriesDeps
): Promise<ResolveMemoriesOutput> {
  const { extractedMemories, existingMemories } = input;
  const { llmClient } = deps;

  const prompt = `
Compare these extracted memories against existing memories.

EXTRACTED (from current note):
${extractedMemories.map((m, i) => `[${i}] ${m.content}`).join('\n')}

EXISTING (in knowledge graph):
${existingMemories.map((m) => `[${m.id}] ${m.content}`).join('\n')}

For each extracted memory, decide:
- ADD: New information, no conflicts
- SKIP: Duplicate of existing memory
- INVALIDATE: Contradicts/supersedes existing memory (specify which and why)
`;

  const result = await llmClient.generateObject({
    prompt,
    schema: decisionSchema,
    schemaName: 'MemoryResolution'
  });

  return { decisions: result.decisions };
}
```

## File Structure

```
src/core/
├── retrieval/
│   ├── phases/
│   │   ├── land.ts
│   │   ├── anchor.ts
│   │   ├── expand.ts
│   │   ├── distill.ts
│   │   ├── trace.ts
│   │   └── index.ts
│   ├── algorithms/
│   │   └── ...
│   ├── pipeline.ts
│   ├── types.ts
│   └── index.ts
└── consolidation/
    ├── phases/
    │   ├── extract-entities.ts
    │   ├── search-entities.ts
    │   ├── resolve-entities.ts
    │   ├── extract-memories.ts
    │   ├── resolve-memories.ts
    │   ├── write-graph.ts
    │   └── index.ts
    ├── agents/
    │   └── ...
    ├── pipeline.ts
    ├── schemas.ts
    ├── types.ts
    └── index.ts
```

## Validation

```bash
bun run typecheck
bun test
```

## Checklist

- [ ] Input/output types defined
- [ ] Config with sensible defaults
- [ ] Dependencies injected (not imported)
- [ ] Async function with error handling
- [ ] Performance tracking (durationMs in metadata)
- [ ] Integrated into pipeline orchestrator
- [ ] Exported from phases/index.ts
