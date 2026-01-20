/**
 * MCP Server
 *
 * Creates the Memento MCP server with the memento_note tool.
 * Uses stateless Streamable HTTP transport for simple request/response operations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Context } from 'hono';
import { z } from 'zod';
import { type ConsolidationOptions, consolidate } from '@/core';
import type { Clients } from '@/server/clients';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dependencies for creating the MCP server.
 */
interface McpServerDeps {
  clients: Clients;
  options: ConsolidationOptions;
}

/**
 * Handler function type returned by createMcpServer.
 */
export type McpHandler = (c: Context) => Promise<Response>;

/**
 * MCP tool result format.
 */
type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Definition
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tool description for memento_note.
 */
const MEMENTO_NOTE_DESCRIPTION = `Save a note to the user's personal knowledge graph (Memento).

## Workflow

1. When user asks to remember or note something, draft the note
2. Present the draft and ask for confirmation
3. Only set confirmed=true after user confirms

## Writing Style

- First-person voice (I, my, me... etc.)
- Full names for people, not pronouns, use the full person's name from conversation or memento memories
- Concise, factual, self-contained, standalone and rich in details
- Do NOT save information already present in Memento memories
- Only save NEW information the user shares

## Examples

User: remember I use Zed for my editor
Assistant: I'll note: "I use Zed as my code editor." Save?
User: yes
→ memento_note(content="I use Zed as my code editor.", confirmed=true)

User: note that John Doe is my manager
Assistant: I'll note: "John Doe is my manager." Save?
User: no, he's my tech lead
Assistant: I'll note: "John Doe is my tech lead." Save?
User: ok
→ memento_note(content="John Doe is my tech lead.", confirmed=true)
`;

/**
 * Input schema for the memento_note tool.
 */
const noteInputSchema = {
  content: z.string().describe('The note in first-person voice'),
  confirmed: z.boolean().describe('true only after user explicitly confirms')
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handler
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create the handler for the memento_note tool.
 */
function createNoteHandler(clients: Clients, options: ConsolidationOptions) {
  const { graphClient, embeddingClient, llmClient } = clients;

  return async ({
    content,
    confirmed
  }: {
    content: string;
    confirmed: boolean;
  }): Promise<ToolResult> => {
    // Reject unconfirmed saves
    if (!confirmed) {
      return {
        content: [{ type: 'text' as const, text: 'Please confirm with the user before saving.' }]
      };
    }

    try {
      const output = await consolidate(
        { content, timestamp: new Date().toISOString() },
        { graphClient, embeddingClient, llmClient },
        options
      );

      if (output.skipped) {
        return {
          content: [{ type: 'text' as const, text: `Skipped: ${output.skipReason}` }]
        };
      }

      return {
        content: [{ type: 'text' as const, text: 'Noted.' }]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Consolidation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Server Factory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates the Memento MCP server.
 *
 * The server exposes a single tool (`memento_note`) for storing notes
 * in the knowledge graph. Uses stateless transport - each request is independent.
 *
 * @param deps - Server dependencies (clients and options)
 * @returns Request handler for the /mcp endpoint
 */
export function createMcpServer(deps: McpServerDeps): McpHandler {
  const { clients, options } = deps;

  // Create MCP server instance
  const mcpServer = new McpServer({
    name: 'memento',
    version: '0.1.0'
  });

  // Register the note tool
  mcpServer.registerTool(
    'memento_note',
    {
      description: MEMENTO_NOTE_DESCRIPTION,
      inputSchema: noteInputSchema
    },
    createNoteHandler(clients, options)
  );

  /**
   * Request handler for the /mcp endpoint.
   *
   * Supports:
   * - POST: Tool calls, initialization (Streamable HTTP)
   * - GET: Not supported in stateless mode (would be SSE for notifications)
   * - DELETE: Not supported in stateless mode (session termination)
   */
  return async function handleRequest(c: Context): Promise<Response> {
    // Create a new stateless transport for each request
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
      enableJsonResponse: true // Return JSON instead of SSE for simple requests
    });

    // Connect server to transport
    await mcpServer.connect(transport);

    try {
      // Handle the request using Web Standard Request/Response
      const response = await transport.handleRequest(c.req.raw);
      return response;
    } finally {
      // Clean up transport after request
      await transport.close();
    }
  };
}
