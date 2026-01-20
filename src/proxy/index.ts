/**
 * Proxy Module
 *
 * LLM proxy layer that intercepts requests, injects memories, and forwards to upstream providers.
 *
 * @example
 * ```typescript
 * import { createRoutes, createProxyClient } from '@/proxy';
 *
 * const client = createProxyClient('openai');
 * const routes = createRoutes({ proxyClient: client, ... });
 * ```
 */

// ============================================================
// Routes
// ============================================================

export { createRoutes, type RoutesConfig } from './routes';

// ============================================================
// Upstream Clients
// ============================================================

export { createProxyClient } from './upstream/factory';

// ============================================================
// Types
// ============================================================

export type {
  AnthropicMessage,
  AnthropicRequestBody,
  ContentBlock,
  ExtendedProxyClient,
  OpenAIMessage,
  OpenAIRequestBody,
  ProxyClient,
  UpstreamLLMProtocol,
  UpstreamLLMProvider
} from './types';

// ============================================================
// Configuration
// ============================================================

export {
  ANTHROPIC_PATHS,
  buildUrl,
  DEFAULT_BASE_URLS,
  getDefaultBaseUrl,
  getProviderDisplayName,
  getRouteProviders,
  OLLAMA_PATHS,
  OPENAI_PATHS,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_ROUTES,
  ROUTE_PROVIDERS
} from './config';

// ============================================================
// Injection (for direct use if needed)
// ============================================================

export { formatRetrievalAsXML, injectIntoBody, wrapInMementoTags } from './injection';
