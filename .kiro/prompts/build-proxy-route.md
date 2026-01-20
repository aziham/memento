---
description: Create a new proxy route for an LLM API format
argument-hint: [provider]
---

# Build Proxy Route: $ARGUMENTS

## Objective

Build a proxy route for the `$ARGUMENTS` LLM API format. The proxy intercepts requests, retrieves relevant memories, injects them into the context, and forwards to the upstream provider.

## Proxy Architecture

```
┌─────────────┐     ┌─────────────────────────────────────────┐     ┌──────────────┐
│   Client    │────▶│              MEMENTO PROXY              │────▶│   Upstream   │
│  (any app)  │     │                                         │     │   LLM API    │
└─────────────┘     │  1. Extract query from request          │     └──────────────┘
                    │  2. Retrieve relevant memories          │            │
                    │  3. Inject memories into context        │            │
                    │  4. Forward to upstream                 │            ▼
                    │  5. Return response unchanged           │     ┌──────────────┐
                    └─────────────────────────────────────────┘     │   Response   │
                                       │                           └──────────────┘
                                       ▼
                              ┌─────────────────┐
                              │ Knowledge Graph │
                              └─────────────────┘
```

### Key Principle: Transparency

The proxy is **invisible** to both client and upstream:

- Client sends standard API request → Gets standard API response
- Upstream receives standard API request → Sends standard API response
- Only the **content** of the last user message is modified (memories prepended)

## Directory Structure

```
src/proxy/
├── routes/
│   ├── handlers.ts      # Route handlers for each provider
│   ├── query.ts         # Extract query from request bodies
│   ├── memory.ts        # Memory retrieval and injection
│   └── index.ts         # Route mounting
├── injection/
│   ├���─ formatter.ts     # Format memories as XML
│   └── inject.ts        # Inject into request body
├── upstream/
│   ├── factory.ts       # Create upstream clients
│   ├── openai.ts        # OpenAI upstream client
│   ├── anthropic.ts     # Anthropic upstream client
│   └── ollama.ts        # Ollama upstream client
├── filters/
│   └── skip-patterns.ts # Skip retrieval for trivial queries
└── index.ts
```

## Implementation

### Step 1: Query Extraction

Extract the user's query from the request body.

```typescript
// src/proxy/routes/query.ts

/**
 * Extract query from OpenAI-format request body.
 */
export function extractQueryFromOpenAI(body: OpenAIRequest): string {
  const messages = body.messages;
  if (!messages || messages.length === 0) return '';

  // Find last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      return extractTextContent(msg.content);
    }
  }
  return '';
}

/**
 * Extract query from Anthropic-format request body.
 */
export function extractQueryFromAnthropic(body: AnthropicRequest): string {
  const messages = body.messages;
  if (!messages || messages.length === 0) return '';

  // Find last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      return extractTextContent(msg.content);
    }
  }
  return '';
}

/**
 * Handle different content formats:
 * - string: "Hello"
 * - array: [{ type: "text", text: "Hello" }, { type: "image", ... }]
 */
function extractTextContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }

  return '';
}
```

### Step 2: Skip Patterns

Skip retrieval for trivial queries.

```typescript
// src/proxy/filters/skip-patterns.ts

const SKIP_PATTERNS = [
  // Greetings
  /^(hi|hello|hey|howdy)[\s!.,]*$/i,

  // Acknowledgments
  /^(yes|no|ok|okay|sure|thanks|thank you|yep|nope)[\s!.,]*$/i,

  // Meta questions
  /^who are you/i,
  /^what (is|are) your name/i,
  /^what can you do/i,

  // Very short
  /^.{0,3}$/
];

/**
 * Check if query should skip memory retrieval.
 */
export function shouldSkipRetrieval(query: string): boolean {
  const trimmed = query.trim();
  return SKIP_PATTERNS.some((pattern) => pattern.test(trimmed));
}
```

### Step 3: Memory Formatting

Format retrieved memories as XML for injection.

```typescript
// src/proxy/injection/formatter.ts

export interface FormattedMemory {
  id: string;
  content: string;
  score: number;
  entities: string[];
  validSince?: string;
  invalidatedBy?: { content: string; reason: string };
}

/**
 * Format memories as XML for LLM context.
 *
 * Why XML?
 * - Clear structure LLMs understand
 * - Distinct from user content
 * - Easy to parse if needed
 */
export function formatMemoriesAsXML(memories: FormattedMemory[]): string {
  if (memories.length === 0) return '';

  const entries = memories.map((m) => {
    const entityList =
      m.entities.length > 0
        ? `\n    <entities>${m.entities.join(', ')}</entities>`
        : '';

    const temporal = m.validSince
      ? `\n    <valid_since>${m.validSince}</valid_since>`
      : '';

    const invalidation = m.invalidatedBy
      ? `\n    <superseded_by reason="${m.invalidatedBy.reason}">${m.invalidatedBy.content}</superseded_by>`
      : '';

    return `  <entry id="${m.id}" relevance="${m.score.toFixed(2)}">
    <content>${escapeXml(m.content)}</content>${entityList}${temporal}${invalidation}
  </entry>`;
  });

  return `<memory context="Retrieved memories relevant to your query">
${entries.join('\n')}
</memory>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

### Step 4: Memory Injection

Inject formatted memories into request body.

```typescript
// src/proxy/injection/inject.ts

/**
 * Inject memories into OpenAI-format request.
 * Prepends to the last user message content.
 */
export function injectIntoOpenAI(
  body: OpenAIRequest,
  memoriesXml: string
): OpenAIRequest {
  if (!memoriesXml) return body;

  const newBody = structuredClone(body);
  const messages = newBody.messages;

  // Find last user message index
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx === -1) return body;

  const msg = messages[lastUserIdx];

  if (typeof msg.content === 'string') {
    msg.content = `${memoriesXml}\n\n${msg.content}`;
  } else if (Array.isArray(msg.content)) {
    // Insert text block at beginning
    msg.content.unshift({
      type: 'text',
      text: memoriesXml
    });
  }

  return newBody;
}

/**
 * Inject memories into Anthropic-format request.
 */
export function injectIntoAnthropic(
  body: AnthropicRequest,
  memoriesXml: string
): AnthropicRequest {
  if (!memoriesXml) return body;

  const newBody = structuredClone(body);
  const messages = newBody.messages;

  // Find last user message
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx === -1) return body;

  const msg = messages[lastUserIdx];

  if (typeof msg.content === 'string') {
    msg.content = `${memoriesXml}\n\n${msg.content}`;
  } else if (Array.isArray(msg.content)) {
    msg.content.unshift({
      type: 'text',
      text: memoriesXml
    });
  }

  return newBody;
}
```

### Step 5: Memory Retrieval Integration

Retrieve memories and handle errors gracefully.

```typescript
// src/proxy/routes/memory.ts

import { retrieve } from '@/core/retrieval';
import { formatMemoriesAsXML } from '../injection/formatter';
import { shouldSkipRetrieval } from '../filters/skip-patterns';

/**
 * Retrieve and format memories for injection.
 * Returns empty string on any error (graceful degradation).
 */
export async function getMemoriesForInjection(
  query: string,
  deps: { graphClient: GraphClient; embeddingClient: EmbeddingClient }
): Promise<string> {
  try {
    // Skip trivial queries
    if (!query || shouldSkipRetrieval(query)) {
      return '';
    }

    // Generate query embedding
    const queryEmbedding = await deps.embeddingClient.embed(query);

    // Run retrieval pipeline
    const result = await retrieve({ query, queryEmbedding }, deps);

    // Format as XML
    if (!result.memories || result.memories.length === 0) {
      return '';
    }

    return formatMemoriesAsXML(result.memories);
  } catch (error) {
    // Log but don't fail the request
    console.error('[PROXY] Memory retrieval failed:', error);
    return '';
  }
}
```

### Step 6: Route Handlers

Create Hono route handlers.

```typescript
// src/proxy/routes/handlers.ts

import { Hono } from 'hono';
import type { Clients } from '@/server/clients';
import { extractQueryFromOpenAI, extractQueryFromAnthropic } from './query';
import { getMemoriesForInjection } from './memory';
import { injectIntoOpenAI, injectIntoAnthropic } from '../injection/inject';

export function createOpenAIRoutes(
  getClients: () => Promise<Clients>,
  upstreamBaseUrl: string,
  apiKey?: string
): Hono {
  const app = new Hono();

  app.post('/v1/chat/completions', async (c) => {
    const body = await c.req.json();
    const clients = await getClients();

    // Extract query
    const query = extractQueryFromOpenAI(body);

    // Get memories
    const memoriesXml = await getMemoriesForInjection(query, clients);

    // Inject memories
    const enrichedBody = injectIntoOpenAI(body, memoriesXml);

    // Forward to upstream
    const response = await fetch(`${upstreamBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey
          ? `Bearer ${apiKey}`
          : (c.req.header('Authorization') ?? '')
      },
      body: JSON.stringify(enrichedBody)
    });

    // Return response (streaming or JSON)
    if (body.stream) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        }
      });
    }

    return c.json(await response.json(), response.status);
  });

  return app;
}

export function createAnthropicRoutes(
  getClients: () => Promise<Clients>,
  upstreamBaseUrl: string,
  apiKey?: string
): Hono {
  const app = new Hono();

  app.post('/v1/messages', async (c) => {
    const body = await c.req.json();
    const clients = await getClients();

    const query = extractQueryFromAnthropic(body);
    const memoriesXml = await getMemoriesForInjection(query, clients);
    const enrichedBody = injectIntoAnthropic(body, memoriesXml);

    const response = await fetch(`${upstreamBaseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey ?? c.req.header('x-api-key') ?? '',
        'anthropic-version': c.req.header('anthropic-version') ?? '2023-06-01'
      },
      body: JSON.stringify(enrichedBody)
    });

    if (body.stream) {
      return new Response(response.body, {
        status: response.status,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    }

    return c.json(await response.json(), response.status);
  });

  return app;
}
```

### Step 7: Route Mounting

Mount all routes on the Hono app.

```typescript
// src/proxy/routes/index.ts

import { Hono } from 'hono';
import type { Config } from '@/config';
import type { Clients } from '@/server/clients';
import { createOpenAIRoutes, createAnthropicRoutes } from './handlers';

export function createProxyRoutes(
  getClients: () => Promise<Clients>,
  config: Config
): Hono {
  const app = new Hono();

  const provider = config.proxy.provider;

  switch (provider) {
    case 'openai':
      app.route(
        '/',
        createOpenAIRoutes(
          getClients,
          config.proxy.baseUrl ?? 'https://api.openai.com',
          config.proxy.apiKey
        )
      );
      break;

    case 'anthropic':
      app.route(
        '/',
        createAnthropicRoutes(
          getClients,
          config.proxy.baseUrl ?? 'https://api.anthropic.com',
          config.proxy.apiKey
        )
      );
      break;

    case 'ollama':
      // Ollama uses different endpoints: /api/chat, /api/generate
      app.route(
        '/',
        createOllamaRoutes(
          getClients,
          config.proxy.baseUrl ?? 'http://localhost:11434'
        )
      );
      break;

    default:
      throw new Error(`Unknown proxy provider: ${provider}`);
  }

  return app;
}
```

### Step 8: Server Integration

Mount proxy routes on the main Hono app.

```typescript
// src/server/index.ts

import { Hono } from 'hono';
import { getConfig } from '@/config';
import { getClients } from './clients';
import { createProxyRoutes } from '@/proxy/routes';
import { createMcpHandler } from '@/mcp';

const app = new Hono();

const config = getConfig();

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Mount proxy routes at root
app.route('/', createProxyRoutes(getClients, config));

// Mount MCP endpoint
app.post('/mcp', createMcpHandler(getClients));

export { app };
```

## Streaming Support

Handle both streaming and non-streaming responses:

```typescript
// Detect streaming from request body
const isStreaming = body.stream === true;

// Forward response appropriately
if (isStreaming) {
  // Pass through the stream
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  });
} else {
  // Parse and return JSON
  return c.json(await upstreamResponse.json());
}
```

## Validation

```bash
bun run typecheck
bun test

# Manual test
curl -X POST http://localhost:6366/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "What do you know about me?"}]
  }'
```

## Checklist

- [ ] Query extractor for the API format
- [ ] Memory injector for the API format
- [ ] Route handler created
- [ ] Streaming support
- [ ] Header passthrough (auth, version)
- [ ] Graceful error handling
- [ ] Routes mounted in index.ts
- [ ] Config schema supports new provider
