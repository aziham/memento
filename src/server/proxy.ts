/**
 * Proxy Endpoint Setup
 *
 * Mounts proxy routes onto the Hono application.
 * Routes intercept LLM requests, inject memories, and forward to upstream providers.
 */

import type { Hono } from 'hono';
import { config, getProxyDisplayName } from '@/config/config';
import { createRoutes } from '@/proxy/routes';
import { createProxyClient } from '@/proxy/upstream/factory';
import { getClients } from './clients';

/** Proxy client instance (stateless, created at import time) */
const proxyClient = createProxyClient(
  config.proxy.provider,
  config.proxy.baseUrl,
  config.proxy.protocol
);

/**
 * Mount proxy routes onto the app.
 *
 * Routes:
 * - POST /v1/chat/completions (OpenAI-compatible)
 * - POST /v1/messages (Anthropic)
 * - POST /api/chat (Ollama native)
 * - POST /api/generate (Ollama generate)
 */
export function mountProxyRoutes(app: Hono): void {
  app.route(
    '/',
    createRoutes({
      proxyClient,
      provider: config.proxy.provider,
      displayName: getProxyDisplayName(config),
      getClients
    })
  );
}
