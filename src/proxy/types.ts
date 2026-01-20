/**
 * Proxy Types
 *
 * Centralized type definitions for the proxy layer.
 * Includes message formats and client interfaces.
 */

import type { ProxyProtocol, ProxyProvider } from '@/config/schema';

// ============================================================
// PROVIDER TYPES
// ============================================================

/** Supported upstream LLM protocols (OpenAI or Anthropic format) */
export type UpstreamLLMProtocol = ProxyProtocol;

/** Supported upstream LLM providers */
export type UpstreamLLMProvider = ProxyProvider;

// ============================================================
// MESSAGE FORMATS
// ============================================================

/** Content block for multi-modal messages */
export interface ContentBlock {
  type: string;
  text?: string;
}

/**
 * OpenAI message format.
 * Used by OpenAI, Ollama (OpenAI-compatible mode), and custom providers.
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

/**
 * Anthropic message format.
 * Note: Anthropic doesn't support 'system' role in messages array.
 */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

/** Request body with OpenAI-format messages */
export interface OpenAIRequestBody {
  messages?: OpenAIMessage[];
  [key: string]: unknown;
}

/** Request body with Anthropic-format messages */
export interface AnthropicRequestBody {
  messages?: AnthropicMessage[];
  [key: string]: unknown;
}

// ============================================================
// PROXY CLIENT INTERFACES
// ============================================================

/**
 * Base proxy client interface for forwarding requests to upstream LLM providers.
 * Takes raw request body and headers and returns the raw response.
 */
export interface ProxyClient {
  /** Forward a chat completion request to the upstream provider */
  chat(body: unknown, headers: Headers): Promise<Response>;
}

/**
 * Extended proxy client interface for providers with additional endpoints.
 * Ollama supports native chat and generate endpoints beyond OpenAI-compatible.
 */
export interface ExtendedProxyClient extends ProxyClient {
  /** Ollama native /api/chat endpoint */
  nativeChat?(body: unknown, headers: Headers): Promise<Response>;
  /** Ollama /api/generate endpoint for raw completions */
  generate?(body: unknown, headers: Headers): Promise<Response>;
}
