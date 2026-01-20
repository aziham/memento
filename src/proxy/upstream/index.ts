/**
 * Upstream Proxy Clients
 *
 * Clients for forwarding requests to upstream LLM providers.
 */

// Client implementations (for advanced use cases)
export { AnthropicProxyClient } from './anthropic';
export { CustomProxyClient } from './custom';
// Factory
export { createProxyClient } from './factory';
export { OllamaProxyClient } from './ollama';
export { OpenAIProxyClient } from './openai';
// Types (re-exported from central types)
export type {
  ExtendedProxyClient,
  ProxyClient,
  UpstreamLLMProtocol,
  UpstreamLLMProvider
} from './types';
