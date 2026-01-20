/**
 * Proxy Configuration
 *
 * Single source of truth for all proxy-related configuration.
 * All upstream clients and middleware MUST use these values.
 *
 * IMPORTANT: Base URLs should include the API version (e.g., /v1).
 * Endpoint paths do NOT include the version - they are appended to the base URL.
 *
 * Example:
 *   baseUrl: "http://localhost:8080/v1"
 *   path: "/chat/completions"
 *   result: "http://localhost:8080/v1/chat/completions"
 */

import type { UpstreamLLMProvider } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Base URLs (should include API version like /v1)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default base URLs for each provider.
 * These should include the API version (e.g., /v1) following industry standards.
 * Endpoint paths are appended to these base URLs.
 */
export const DEFAULT_BASE_URLS: Record<UpstreamLLMProvider, string | undefined> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  ollama: 'http://localhost:11434/v1',
  custom: undefined // Custom provider requires explicit baseUrl
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Endpoint Paths (appended to base URL by clients)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Endpoint paths for OpenAI and OpenAI-compatible providers.
 * Note: Paths do NOT include /v1 - that should be part of the baseUrl.
 */
export const OPENAI_PATHS = {
  chatCompletions: '/chat/completions'
} as const;

/**
 * Endpoint paths for Anthropic.
 * Note: Paths do NOT include /v1 - that should be part of the baseUrl.
 */
export const ANTHROPIC_PATHS = {
  messages: '/messages'
} as const;

/**
 * Endpoint paths for Ollama.
 * Ollama supports both OpenAI-compatible and native endpoints.
 * Note: OpenAI-compatible path does NOT include /v1 - that should be part of the baseUrl.
 */
export const OLLAMA_PATHS = {
  /** OpenAI-compatible chat completions */
  chatCompletions: '/chat/completions',
  /** Native Ollama chat endpoint */
  nativeChat: '/api/chat',
  /** Native Ollama generate endpoint */
  generate: '/api/generate'
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Route Configuration (for proxy server routing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps incoming proxy routes to allowed providers.
 * Used by route handlers to validate provider compatibility.
 */
export const ROUTE_PROVIDERS: Record<string, readonly UpstreamLLMProvider[]> = {
  [OPENAI_PATHS.chatCompletions]: ['openai', 'custom', 'ollama'],
  [ANTHROPIC_PATHS.messages]: ['anthropic', 'custom'],
  [OLLAMA_PATHS.nativeChat]: ['ollama'],
  [OLLAMA_PATHS.generate]: ['ollama']
} as const;

/**
 * Maps providers to their valid incoming routes.
 * Inverse of ROUTE_PROVIDERS - used for error messages.
 */
export const PROVIDER_ROUTES: Record<UpstreamLLMProvider, readonly string[]> = {
  openai: [OPENAI_PATHS.chatCompletions],
  anthropic: [ANTHROPIC_PATHS.messages],
  ollama: [OPENAI_PATHS.chatCompletions, OLLAMA_PATHS.nativeChat, OLLAMA_PATHS.generate],
  custom: [OPENAI_PATHS.chatCompletions, ANTHROPIC_PATHS.messages]
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Display Names
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Human-readable display names for providers.
 * Used in error messages and logging.
 */
export const PROVIDER_DISPLAY_NAMES: Record<UpstreamLLMProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
  custom: 'Custom'
} as const;

/**
 * Get display name for a provider.
 * For custom providers, returns the configured name or 'Custom'.
 */
export function getProviderDisplayName(provider: UpstreamLLMProvider, customName?: string): string {
  if (provider === 'custom' && customName) {
    return customName;
  }
  return PROVIDER_DISPLAY_NAMES[provider];
}

// ═══════════════════════════════════════════════════════════════════════════════
// URL Builders
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build full URL from base URL and path.
 * Handles trailing slashes correctly.
 */
export function buildUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

/**
 * Get the default base URL for a provider.
 * Throws if provider requires explicit baseUrl (custom).
 */
export function getDefaultBaseUrl(provider: UpstreamLLMProvider): string {
  const url = DEFAULT_BASE_URLS[provider];
  if (!url) {
    throw new Error(`Provider '${provider}' requires an explicit baseUrl`);
  }
  return url;
}

/**
 * Get allowed providers for a route.
 * Throws if route is not configured.
 */
export function getRouteProviders(route: string): readonly UpstreamLLMProvider[] {
  const providers = ROUTE_PROVIDERS[route];
  if (!providers) {
    throw new Error(`Route '${route}' is not configured`);
  }
  return providers;
}
