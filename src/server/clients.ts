/**
 * Shared Client Initialization
 *
 * Lazy initialization of clients shared across endpoints.
 * Graph, embedding, and LLM clients are created on first request.
 */

import { config } from '@/config/config';
import { createEmbeddingClient } from '@/providers/embedding/factory';
import type { EmbeddingClient } from '@/providers/embedding/types';
import { createGraphClient } from '@/providers/graph';
import type { GraphClient } from '@/providers/graph/types';
import { createLLMClient } from '@/providers/llm/factory';
import type { LLMClient } from '@/providers/llm/types';

/**
 * Shared clients used by proxy and MCP endpoints.
 */
export interface Clients {
  graphClient: GraphClient;
  embeddingClient: EmbeddingClient;
  llmClient: LLMClient;
}

/** Cached clients instance */
let clients: Clients | null = null;
let initPromise: Promise<Clients> | null = null;

/**
 * Get initialized clients.
 * Lazy initialization ensures clients are only created when needed.
 */
export async function getClients(): Promise<Clients> {
  if (clients) return clients;

  if (!initPromise) {
    initPromise = initializeClients();
  }

  clients = await initPromise;
  return clients;
}

/**
 * Initialize all shared clients.
 */
async function initializeClients(): Promise<Clients> {
  const graphClient = createGraphClient({
    uri: process.env['NEO4J_URI'] ?? 'bolt://localhost:7687',
    user: process.env['N4J_USER'] ?? 'memento',
    password: process.env['N4J_PASSWORD'] ?? 'memento',
    database: process.env['N4J_DATABASE'] ?? 'memory'
  });
  await graphClient.connect();
  await graphClient.initializeSchema(config.embedding.dimensions);

  const embeddingClient = createEmbeddingClient(
    config.embedding.provider,
    config.embedding.model,
    config.embedding.dimensions,
    {
      apiKey: config.embedding.apiKey,
      baseUrl: config.embedding.baseUrl
    }
  );

  const llmClient = createLLMClient(config.llm.provider, config.llm.defaults.model, {
    apiKey: config.llm.apiKey,
    baseUrl: config.llm.baseUrl
  });

  return { graphClient, embeddingClient, llmClient };
}
