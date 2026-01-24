/**
 * Memory Injection
 *
 * Retrieves memories from the knowledge graph and injects them into request bodies.
 * Graceful degradation - failures result in the original body being returned.
 */

import { type RetrievalOutput, retrieve } from '@/core';
import { shouldSkipRetrieval } from '@/proxy/filters';
import { formatRetrievalAsXML, injectIntoBody, wrapInMementoTags } from '@/proxy/injection';
import type { AnthropicRequestBody, OpenAIRequestBody } from '@/proxy/types';
import type { Clients } from '@/server/clients';
import { logRetrievalResult, logRetrievalStart } from '@/utils/logger';
import { extractQueryFromBody } from './query';

/**
 * Inject memories into request body if retrieval is available.
 *
 * This is the main integration point between the proxy layer and the retrieval pipeline.
 * It extracts the user query, retrieves relevant memories, and injects them into the request.
 *
 * Graceful degradation:
 * - If query extraction fails → returns original body
 * - If retrieval fails → returns original body
 * - If no memories found → returns original body
 *
 * @param body - Request body (OpenAI or Anthropic format)
 * @param getClients - Lazy client getter (defers initialization until needed)
 * @returns Modified request body with memories injected, or original if no memories
 */
export async function injectMemoriesIfAvailable<T extends OpenAIRequestBody | AnthropicRequestBody>(
  body: T,
  getClients: () => Promise<Clients>
): Promise<T> {
  try {
    const clients = await getClients();
    const query = extractQueryFromBody(body);

    if (!query || shouldSkipRetrieval(query)) {
      return body;
    }

    // Log the start of retrieval
    logRetrievalStart(query);

    // Generate query embedding for vector search
    const queryEmbedding = await clients.embeddingClient.embed(query);

    // Retrieve memories using the full pipeline (LAND → ANCHOR → EXPAND → DISTILL → TRACE)
    const result = (await retrieve(
      { query, queryEmbedding },
      {
        graphClient: clients.graphClient,
        embeddingClient: clients.embeddingClient,
        llmClient: clients.llmClient
      }
    )) as RetrievalOutput;

    // Log the result
    if (result.memories.length > 0) {
      logRetrievalResult(result);
    }

    // Skip injection if no memories found
    if (result.memories.length === 0) {
      return body;
    }

    // Format memories as XML and wrap in memento tags
    const xml = formatRetrievalAsXML(result);
    const mementoContent = wrapInMementoTags(xml);

    // Inject into the last user message
    return injectIntoBody(body, mementoContent);
  } catch {
    // Graceful degradation - continue without memories
    return body;
  }
}
