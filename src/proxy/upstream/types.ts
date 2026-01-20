import type { ProxyProtocol, ProxyProvider } from '@/config/schema';

export type UpstreamLLMProtocol = ProxyProtocol;
export type UpstreamLLMProvider = ProxyProvider;

/**
 * Base proxy client interface for forwarding requests to upstream LLM providers.
 * Takes raw request body and headers and returns the raw response.
 */
export interface ProxyClient {
  chat(body: unknown, headers: Headers): Promise<Response>;
}

/**
 * Extended proxy client interface for providers with additional endpoints.
 * Ollama supports native chat and generate endpoints beyond OpenAI-compatible.
 */
export interface ExtendedProxyClient extends ProxyClient {
  nativeChat?(body: unknown, headers: Headers): Promise<Response>;
  generate?(body: unknown, headers: Headers): Promise<Response>;
}
