/**
 * MCP Endpoint Handler
 *
 * Thin handler that mounts the MCP server onto the /mcp endpoint.
 * Delegates to @/mcp for server creation and tool implementation.
 */

import type { Context } from 'hono';
import { config } from '@/config/config';
import { createMcpServer, type McpHandler } from '@/mcp';
import { getClients } from './clients';

// ═══════════════════════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════════════════════

/** Cached MCP handler */
let mcpHandler: McpHandler | null = null;

/**
 * Handle MCP endpoint requests.
 *
 * Lazily initializes the MCP server on first request.
 * Subsequent requests reuse the cached handler.
 */
export async function handleMcp(c: Context): Promise<Response> {
  if (!mcpHandler) {
    const clients = await getClients();

    mcpHandler = createMcpServer({
      clients,
      options: {
        temperature: config.llm.consolidation.temperature ?? 0.5,
        maxTokens: config.llm.consolidation.maxTokens ?? 15000,
        maxRetries: config.llm.consolidation.maxRetries ?? 3,
        options: config.llm.consolidation.options
      }
    });
  }

  return mcpHandler(c);
}
