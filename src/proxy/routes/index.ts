/**
 * Proxy Routes
 *
 * Creates and mounts all proxy routes for LLM API passthrough.
 * Each route injects relevant memories before forwarding to upstream.
 */

import { Hono } from 'hono';
import type { ExtendedProxyClient, ProxyClient, UpstreamLLMProvider } from '@/proxy/types';
import type { Clients } from '@/server/clients';
import {
  createAnthropicHandler,
  createOllamaChatHandler,
  createOllamaGenerateHandler,
  createOpenAIHandler,
  type HandlerContext
} from './handlers';

/**
 * Configuration for creating routes.
 */
export interface RoutesConfig {
  /** Proxy client for forwarding requests to upstream */
  proxyClient: ProxyClient | ExtendedProxyClient;
  /** Currently configured upstream provider */
  provider: UpstreamLLMProvider;
  /** Human-readable provider name for error messages */
  displayName: string;
  /** Function to get initialized clients (lazy initialization) */
  getClients: () => Promise<Clients>;
}

/**
 * Create all proxy routes.
 *
 * Routes:
 * - POST /v1/chat/completions (OpenAI-compatible)
 * - POST /v1/messages (Anthropic)
 * - POST /api/chat (Ollama native)
 * - POST /api/generate (Ollama generate)
 *
 * @param config - Route configuration with proxy client and provider info
 * @returns Hono app with all routes mounted
 */
export function createRoutes(config: RoutesConfig): Hono {
  const { proxyClient, provider, displayName, getClients } = config;
  const app = new Hono();

  // Shared context for all handlers
  const ctx: HandlerContext = {
    proxyClient,
    provider,
    displayName,
    getClients
  };

  // OpenAI-compatible endpoint (OpenAI, Ollama in OpenAI mode, custom)
  app.post('/v1/chat/completions', createOpenAIHandler(ctx));

  // Anthropic endpoint (Anthropic, custom with Anthropic protocol)
  app.post('/v1/messages', createAnthropicHandler(ctx));

  // Ollama native chat endpoint
  app.post('/api/chat', createOllamaChatHandler(ctx));

  // Ollama generate endpoint (no memory injection - uses prompt string)
  app.post('/api/generate', createOllamaGenerateHandler(ctx));

  return app;
}
