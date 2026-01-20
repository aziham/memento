---
description: Create an MCP tool for agent interaction
argument-hint: [tool-name]
---

# Build MCP Tool: $ARGUMENTS

## Objective

Build the `$ARGUMENTS` MCP tool. MCP (Model Context Protocol) tools are the interface for AI agents to explicitly interact with Memento - storing memories, querying knowledge, etc.

## MCP Architecture

```
┌─────────────────┐     ┌─────────────────────────────────────────┐
│    AI Agent     │     │              MEMENTO                    │
│  (Claude, etc.) │     │                                         │
│                 │────▶│  MCP Server (Hono endpoint)             │
│  Calls tools:   │     │    │                                    │
│  - memento_note │     │    ├──▶ Tool: memento_note              │
│  - memento_X    │     │    │      └──▶ Consolidation Pipeline   │
│                 │◀────│    │                                    │
└─────────────────┘     │    ├──▶ Tool: memento_search            │
                        │    │      └──▶ Retrieval Pipeline       │
                        │    │                                    │
                        └────┴────────────────────────────────────┘
```

### MCP Protocol

MCP uses JSON-RPC 2.0 over HTTP. Key concepts:

- **Tools**: Functions the agent can call
- **Input Schema**: JSON Schema for tool parameters
- **Response**: Structured result or error

## Directory Structure

```
src/mcp/
├── server.ts       # MCP server with tool definitions
├── handlers/
│   ├── note.ts     # memento_note handler
│   ├── search.ts   # memento_search handler (future)
│   └── index.ts
├── schemas.ts      # Zod schemas for tool inputs
└── index.ts        # Public exports
```

## Implementation

### Step 1: Install MCP SDK

```bash
bun add @modelcontextprotocol/sdk
```

### Step 2: Define Tool Schema

```typescript
// src/mcp/schemas.ts

import { z } from 'zod';

/**
 * memento_note: Store important information in memory.
 */
export const noteInputSchema = z.object({
  content: z
    .string()
    .min(1)
    .describe('The information to remember. Be specific and detailed.'),

  confirmed: z
    .boolean()
    .describe('Set to true to confirm storage. First call shows preview.')
});

export type NoteInput = z.infer<typeof noteInputSchema>;

/**
 * memento_search: Query the knowledge graph (future tool).
 */
export const searchInputSchema = z.object({
  query: z.string().min(1).describe('Natural language search query'),

  limit: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe('Maximum results to return'),

  includeInvalidated: z
    .boolean()
    .default(false)
    .describe('Include superseded memories')
});

export type SearchInput = z.infer<typeof searchInputSchema>;
```

### Step 3: Create Tool Handler

```typescript
// src/mcp/handlers/note.ts

import type { GraphClient } from '@/providers/graph';
import type { EmbeddingClient } from '@/providers/embedding';
import type { LLMClient } from '@/providers/llm';
import { consolidate } from '@/core/consolidation';
import type { NoteInput } from '../schemas';

export interface NoteDeps {
  graphClient: GraphClient;
  embeddingClient: EmbeddingClient;
  llmClient: LLMClient;
}

export interface NoteResult {
  success: boolean;
  message: string;
  preview?: {
    entities: string[];
    memories: string[];
  };
  stored?: {
    noteId: string;
    memoryCount: number;
    entityCount: number;
  };
}

/**
 * Handle memento_note tool call.
 *
 * Two-step process:
 * 1. First call (confirmed=false): Preview what will be extracted
 * 2. Second call (confirmed=true): Actually store to graph
 */
export async function handleNote(
  input: NoteInput,
  deps: NoteDeps
): Promise<NoteResult> {
  const { content, confirmed } = input;

  // Preview mode: show what would be extracted
  if (!confirmed) {
    // Quick extraction to show preview
    const preview = await previewExtraction(content, deps);

    return {
      success: true,
      message:
        'Preview of what will be stored. Call again with confirmed=true to save.',
      preview: {
        entities: preview.entities.map((e) => `${e.name} (${e.type})`),
        memories: preview.memories.map((m) => m.content)
      }
    };
  }

  // Confirmed: run full consolidation pipeline
  try {
    const result = await consolidate(
      { content, timestamp: new Date().toISOString() },
      deps
    );

    return {
      success: true,
      message: `Stored ${result.memoryCount} memories about ${result.entityCount} entities.`,
      stored: {
        noteId: result.noteId,
        memoryCount: result.memoryCount,
        entityCount: result.entityCount
      }
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to store: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function previewExtraction(
  content: string,
  deps: NoteDeps
): Promise<{ entities: any[]; memories: any[] }> {
  // Run just extraction phases without writing
  const entities = await extractEntities({ content, userName: 'User' }, deps);
  const memories = await extractMemories(
    { content, entities: entities.entities },
    deps
  );

  return {
    entities: entities.entities,
    memories: memories.memories
  };
}
```

### Step 4: Create MCP Server

```typescript
// src/mcp/server.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GraphClient } from '@/providers/graph';
import type { EmbeddingClient } from '@/providers/embedding';
import type { LLMClient } from '@/providers/llm';
import { handleNote } from './handlers/note';

export interface McpDeps {
  graphClient: GraphClient;
  embeddingClient: EmbeddingClient;
  llmClient: LLMClient;
}

/**
 * Create MCP server with Memento tools.
 */
export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({
    name: 'memento',
    version: '1.0.0'
  });

  // Tool: memento_note
  server.tool(
    'memento_note',
    'Store important information in your persistent memory. Use this when the user wants you to remember something for future conversations.',
    {
      content: z
        .string()
        .describe(
          'The information to remember. Write in third person: "USER prefers TypeScript" not "You prefer TypeScript"'
        ),
      confirmed: z
        .boolean()
        .describe(
          'Set to true to confirm storage. First call with false to preview what will be extracted.'
        )
    },
    async (input) => {
      const result = await handleNote(
        { content: input.content, confirmed: input.confirmed },
        deps
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ],
        isError: !result.success
      };
    }
  );

  // Tool: memento_search (example for future)
  server.tool(
    'memento_search',
    'Search your persistent memory for relevant information.',
    {
      query: z.string().describe('Natural language search query'),
      limit: z.number().optional().describe('Max results (default 10)')
    },
    async (input) => {
      // Implementation would call retrieval pipeline
      const result = await handleSearch(input, deps);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
  );

  return server;
}
```

### Step 5: Create HTTP Handler

```typescript
// src/mcp/index.ts

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Context } from 'hono';
import type { Clients } from '@/server/clients';
import { createMcpServer } from './server';

/**
 * Create Hono handler for MCP endpoint.
 */
export function createMcpHandler(
  getClients: () => Promise<Clients>
): (c: Context) => Promise<Response> {
  return async (c) => {
    const clients = await getClients();

    const server = createMcpServer({
      graphClient: clients.graphClient,
      embeddingClient: clients.embeddingClient,
      llmClient: clients.llmClient
    });

    // Create transport for this request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined // Stateless
    });

    // Connect server to transport
    await server.connect(transport);

    // Handle the request
    const body = await c.req.text();
    const response = await transport.handleRequest(
      new Request(c.req.url, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body
      })
    );

    return response;
  };
}

export { createMcpServer } from './server';
```

### Step 6: Mount in Server

```typescript
// src/server/index.ts

import { Hono } from 'hono';
import { createMcpHandler } from '@/mcp';
import { getClients } from './clients';

const app = new Hono();

// MCP endpoint
app.post('/mcp', createMcpHandler(getClients));

export { app };
```

## Tool Design Patterns

### Confirmation Pattern

For destructive or important operations, require confirmation:

```typescript
server.tool('memento_forget', 'Invalidate a memory', schema, async (input) => {
  if (!input.confirmed) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'This will mark the memory as superseded. Confirm?',
            memoryToForget: input.memoryId,
            preview: await getMemoryContent(input.memoryId)
          })
        }
      ]
    };
  }

  // Actually invalidate
  await invalidateMemory(input.memoryId, input.reason);
  return { content: [{ type: 'text', text: 'Memory invalidated.' }] };
});
```

### Structured Response

Return structured data agents can parse:

```typescript
interface ToolResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  metadata?: {
    durationMs: number;
    itemCount: number;
  };
}
```

### Error Handling

Never throw - return error in response:

```typescript
server.tool('tool_name', 'description', schema, async (input) => {
  try {
    const result = await doSomething(input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      ],
      isError: true
    };
  }
});
```

## Tool Naming Convention

Use `memento_` prefix for all tools:

| Tool               | Purpose             |
| ------------------ | ------------------- |
| `memento_note`     | Store information   |
| `memento_search`   | Query memories      |
| `memento_forget`   | Invalidate memory   |
| `memento_entities` | List known entities |
| `memento_history`  | Get memory timeline |

## Validation

```bash
bun run typecheck
bun test

# Test MCP endpoint
curl -X POST http://localhost:6366/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "memento_note",
      "arguments": {
        "content": "I prefer TypeScript over JavaScript",
        "confirmed": false
      }
    },
    "id": 1
  }'
```

## Checklist

- [ ] Tool schema defined with Zod
- [ ] Handler function implemented
- [ ] Tool registered with MCP server
- [ ] Confirmation pattern (if needed)
- [ ] Structured response format
- [ ] Error handling (never throws)
- [ ] Tool uses `memento_` prefix
- [ ] Schema fields have descriptions
- [ ] HTTP handler mounted
