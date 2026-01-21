/**
 * Route Handlers
 *
 * Individual handler implementations for each proxy route.
 * Each handler validates the provider, injects memories, and forwards to upstream.
 */

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type {
  AnthropicRequestBody,
  ExtendedProxyClient,
  OpenAIRequestBody,
  ProxyClient,
  UpstreamLLMProvider
} from '@/proxy/types';
import type { Clients } from '@/server/clients';
import { injectMemoriesIfAvailable } from './memory';

/**
 * Context shared by all route handlers.
 */
export interface HandlerContext {
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
 * Create handler for OpenAI-compatible endpoint.
 * Used by: OpenAI, Ollama (OpenAI-compatible mode), custom providers.
 */
export function createOpenAIHandler(ctx: HandlerContext) {
  return async (c: Context): Promise<Response> => {
    validateProvider(['openai', 'custom', 'ollama'], ctx.provider, ctx.displayName);

    const body = (await c.req.json()) as OpenAIRequestBody;
    const finalBody = await injectMemoriesIfAvailable(body, ctx.getClients);

    const response = await ctx.proxyClient.chat(finalBody, c.req.raw.headers);

    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
  };
}

/**
 * Create handler for Anthropic endpoint.
 * Used by: Anthropic, custom providers with Anthropic protocol.
 */
export function createAnthropicHandler(ctx: HandlerContext) {
  return async (c: Context): Promise<Response> => {
    validateProvider(['anthropic', 'custom'], ctx.provider, ctx.displayName);

    const body = (await c.req.json()) as AnthropicRequestBody;
    const finalBody = await injectMemoriesIfAvailable(body, ctx.getClients);

    const response = await ctx.proxyClient.chat(finalBody, c.req.raw.headers);
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
  };
}

/**
 * Create handler for Ollama native chat endpoint.
 * Only available when provider is 'ollama'.
 */
export function createOllamaChatHandler(ctx: HandlerContext) {
  return async (c: Context): Promise<Response> => {
    validateProvider(['ollama'], ctx.provider, ctx.displayName);

    const extendedClient = ctx.proxyClient as ExtendedProxyClient;
    if (!extendedClient.nativeChat) {
      throw new HTTPException(500, { message: 'Ollama native chat not supported' });
    }

    const body = (await c.req.json()) as OpenAIRequestBody;
    const finalBody = await injectMemoriesIfAvailable(body, ctx.getClients);

    const response = await extendedClient.nativeChat(finalBody, c.req.raw.headers);
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
  };
}

/**
 * Create handler for Ollama generate endpoint.
 * No memory injection - uses prompt string, not messages array.
 */
export function createOllamaGenerateHandler(ctx: HandlerContext) {
  return async (c: Context): Promise<Response> => {
    validateProvider(['ollama'], ctx.provider, ctx.displayName);

    const extendedClient = ctx.proxyClient as ExtendedProxyClient;
    if (!extendedClient.generate) {
      throw new HTTPException(500, { message: 'Ollama generate not supported' });
    }

    const body = await c.req.json();
    const response = await extendedClient.generate(body, c.req.raw.headers);
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
  };
}

/**
 * Validate that the current provider supports this endpoint.
 * Throws HTTPException if not supported.
 *
 * @param allowedProviders - List of providers that support this endpoint
 * @param currentProvider - Currently configured provider
 * @param displayName - Human-readable provider name for error message
 */
function validateProvider(
  allowedProviders: UpstreamLLMProvider[],
  currentProvider: UpstreamLLMProvider,
  displayName: string
): void {
  if (!allowedProviders.includes(currentProvider)) {
    throw new HTTPException(400, {
      message:
        `This endpoint is not supported by the configured provider (${displayName}). ` +
        `Allowed providers: ${allowedProviders.join(', ')}`
    });
  }
}
