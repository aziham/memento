---
description: Create a new provider (embedding, LLM, or graph) following factory pattern
argument-hint: [type] [name]
---

# Build Provider: $ARGUMENTS

## Objective

Build a provider of type `$1` named `$2`. Providers are infrastructure adapters that wrap external services (embedding APIs, LLM APIs, graph databases) behind a clean interface.

## Provider Architecture

Memento uses the **Factory Pattern** to create provider instances based on configuration. This enables:

- **Provider-agnostic core logic** - Pipelines don't care which embedding API you use
- **Easy provider switching** - Change providers via config, not code
- **Testability** - Mock providers for testing

### Directory Structure

```
src/providers/
├── embedding/
│   ├── types.ts       # EmbeddingClient interface
│   ├── factory.ts     # createEmbeddingClient()
│   ├── openai.ts      # OpenAI implementation
│   ├── ollama.ts      # Ollama implementation
│   ├── utils.ts       # Shared utilities (L2 normalize)
│   └── index.ts       # Public exports
├── llm/
│   ├── types.ts       # LLMClient interface
│   ├── factory.ts     # createLLMClient()
│   ├── client.ts      # Implementation with structured output
│   └── index.ts
└── graph/
    └── neo4j/
        ├── types.ts   # GraphClient interface
        ├── client.ts  # Neo4j implementation
        ├── schema.ts  # Index/constraint setup
        ├── operations/
        │   ├── nodes.ts
        │   ├── edges.ts
        │   ├── search.ts
        │   └── index.ts
        └── index.ts
```

## Building an Embedding Provider

### Step 1: Define the Interface

```typescript
// src/providers/embedding/types.ts

export interface EmbeddingClient {
  /**
   * Generate embedding vector for text.
   * All vectors MUST be L2-normalized for consistent cosine similarity.
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts.
   * More efficient than calling embed() in a loop.
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingConfig {
  provider: 'openai' | 'google' | 'cohere' | 'mistral' | 'ollama';
  apiKey?: string;
  baseUrl?: string;
  model: string;
  dimensions?: number;
}
```

### Step 2: Implement Utilities

```typescript
// src/providers/embedding/utils.ts

/**
 * L2 normalize a vector (unit length).
 * Required for consistent cosine similarity calculations.
 */
export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}
```

### Step 3: Implement a Provider

```typescript
// src/providers/embedding/openai.ts

import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingClient } from './types';
import { l2Normalize } from './utils';

export function createOpenAIEmbeddingClient(
  apiKey: string,
  model: string,
  dimensions?: number
): EmbeddingClient {
  const openai = createOpenAI({ apiKey });
  const embeddingModel = openai.textEmbeddingModel(model, { dimensions });

  return {
    async embed(text: string): Promise<number[]> {
      const result = await embed({
        model: embeddingModel,
        value: text
      });
      return l2Normalize(result.embedding);
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      const result = await embedMany({
        model: embeddingModel,
        values: texts
      });
      return result.embeddings.map(l2Normalize);
    }
  };
}
```

### Step 4: Create the Factory

```typescript
// src/providers/embedding/factory.ts

import type { EmbeddingClient, EmbeddingConfig } from './types';
import { createOpenAIEmbeddingClient } from './openai';
import { createOllamaEmbeddingClient } from './ollama';
// ... other providers

export function createEmbeddingClient(
  config: EmbeddingConfig
): EmbeddingClient {
  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) throw new Error('OpenAI requires apiKey');
      return createOpenAIEmbeddingClient(
        config.apiKey,
        config.model,
        config.dimensions
      );

    case 'ollama':
      return createOllamaEmbeddingClient(
        config.baseUrl ?? 'http://localhost:11434',
        config.model,
        config.dimensions
      );

    // Add more providers here

    default:
      throw new Error(`Unknown embedding provider: ${config.provider}`);
  }
}
```

### Step 5: Export Public API

```typescript
// src/providers/embedding/index.ts

export type { EmbeddingClient, EmbeddingConfig } from './types';
export { createEmbeddingClient } from './factory';
export { l2Normalize } from './utils';
```

## Building an LLM Provider

### Interface

```typescript
// src/providers/llm/types.ts

import type { z } from 'zod';

export interface LLMClient {
  /**
   * Generate structured output from LLM.
   * Uses Zod schema for validation.
   */
  generateObject<T>(options: {
    prompt: string;
    schema: z.ZodType<T>;
    schemaName: string;
    schemaDescription?: string;
  }): Promise<T>;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'ollama';
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}
```

### Structured Output Strategy

LLMs have varying support for structured output. Implement a fallback chain:

```typescript
// src/providers/llm/client.ts

import { generateObject, Output } from 'ai';
import { zodSchema } from '@ai-sdk/zod';

export function createLLMClient(
  model: LanguageModel,
  config: LLMConfig
): LLMClient {
  return {
    async generateObject<T>(options): Promise<T> {
      const { prompt, schema, schemaName, schemaDescription } = options;

      // Try structured output first (best for OpenAI GPT-4+)
      try {
        const result = await generateObject({
          model,
          schema: zodSchema(schema),
          schemaName,
          schemaDescription,
          prompt,
          temperature: config.temperature ?? 0,
          maxTokens: config.maxTokens
        });
        return result.object;
      } catch (error) {
        // Fallback to JSON mode or prompt-based extraction
        return this.fallbackGenerate(prompt, schema);
      }
    },

    async fallbackGenerate<T>(
      prompt: string,
      schema: z.ZodType<T>
    ): Promise<T> {
      // Embed schema in prompt, parse JSON from response
      const schemaPrompt = `
${prompt}

Respond with valid JSON matching this schema:
${JSON.stringify(zodToJsonSchema(schema), null, 2)}
`;
      const result = await generateText({ model, prompt: schemaPrompt });
      const parsed = JSON.parse(extractJson(result.text));
      return schema.parse(parsed);
    }
  };
}
```

## Building a Graph Provider

### Interface

```typescript
// src/providers/graph/neo4j/types.ts

export interface GraphClient {
  // Node operations
  createMemory(data: MemoryData): Promise<string>;
  getMemory(id: string): Promise<Memory | null>;

  createEntity(data: EntityData): Promise<string>;
  getEntity(id: string): Promise<Entity | null>;
  searchEntities(query: string, limit?: number): Promise<Entity[]>;

  // Edge operations
  createEdge(
    from: string,
    to: string,
    type: EdgeType,
    props?: EdgeProps
  ): Promise<void>;

  // Search operations
  searchVector(
    nodeType: 'Memory' | 'Entity',
    embedding: number[],
    limit?: number
  ): Promise<ScoredNode[]>;

  searchFulltext(
    indexName: string,
    query: string,
    limit?: number
  ): Promise<ScoredNode[]>;

  // Graph algorithms
  runPersonalizedPageRank(
    sourceIds: string[],
    dampingFactor?: number,
    iterations?: number
  ): Promise<PPRResult[]>;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}
```

### Implementation Pattern

```typescript
// src/providers/graph/neo4j/client.ts

import neo4j, { Driver, Session } from 'neo4j-driver';
import type { GraphClient } from './types';

export function createNeo4jClient(
  uri: string,
  username: string,
  password: string,
  database: string
): GraphClient {
  const driver: Driver = neo4j.driver(
    uri,
    neo4j.auth.basic(username, password)
  );

  const getSession = (): Session => driver.session({ database });

  return {
    async createMemory(data) {
      const session = getSession();
      try {
        const result = await session.run(
          `CREATE (m:Memory {
            id: randomUUID(),
            content: $content,
            embedding: $embedding,
            validAt: $validAt
          })
          RETURN m.id as id`,
          data
        );
        return result.records[0].get('id');
      } finally {
        await session.close();
      }
    },

    async searchVector(nodeType, embedding, limit = 10) {
      const session = getSession();
      try {
        const result = await session.run(
          `CALL db.index.vector.queryNodes($indexName, $limit, $embedding)
           YIELD node, score
           RETURN node, score
           ORDER BY score DESC`,
          {
            indexName: `${nodeType.toLowerCase()}_embedding`,
            limit: neo4j.int(limit),
            embedding
          }
        );
        return result.records.map((r) => ({
          node: r.get('node').properties,
          score: r.get('score')
        }));
      } finally {
        await session.close();
      }
    },

    async initialize() {
      // Create indexes and constraints
      const session = getSession();
      try {
        await session.run(`
          CREATE VECTOR INDEX memory_embedding IF NOT EXISTS
          FOR (m:Memory) ON (m.embedding)
          OPTIONS {
            indexConfig: {
              \`vector.dimensions\`: 1536,
              \`vector.similarity_function\`: 'cosine'
            }
          }
        `);
        // ... more indexes
      } finally {
        await session.close();
      }
    },

    async close() {
      await driver.close();
    }
  };
}
```

## Provider Usage Pattern

Providers are created once at startup and injected into pipelines:

```typescript
// src/server/clients.ts

import { getConfig } from '@/config';
import { createEmbeddingClient } from '@/providers/embedding';
import { createLLMClient } from '@/providers/llm';
import { createNeo4jClient } from '@/providers/graph/neo4j';

export interface Clients {
  embeddingClient: EmbeddingClient;
  llmClient: LLMClient;
  graphClient: GraphClient;
}

let clients: Clients | null = null;

export async function getClients(): Promise<Clients> {
  if (clients) return clients;

  const config = getConfig();

  const embeddingClient = createEmbeddingClient(config.embedding);
  const llmClient = createLLMClient(config.llm);
  const graphClient = createNeo4jClient(
    config.graph.uri,
    config.graph.username,
    config.graph.password,
    config.graph.database
  );

  await graphClient.initialize();

  clients = { embeddingClient, llmClient, graphClient };
  return clients;
}
```

## Validation

```bash
bun run typecheck
bun test
```

## Checklist

- [ ] Interface defined in `types.ts`
- [ ] Implementation created for the provider
- [ ] Factory updated with new provider case
- [ ] Config schema supports new provider
- [ ] L2 normalization for embeddings
- [ ] Error handling with descriptive messages
- [ ] Exported from `index.ts`
