# Technical Architecture

## Technology Stack

### Runtime & Framework

- **Bun**: JavaScript/TypeScript runtime (no Node.js, runs TS directly, no build step)
- **Hono**: Lightweight HTTP framework for proxy and MCP endpoints
- **TypeScript**: Strict mode with comprehensive type safety

### Database

- **DozerDB**: Neo4j 5.26 distribution with Graph Data Science (GDS) bundled
- **Vector Indexes**: Native Neo4j vector search (cosine similarity)
- **Fulltext Indexes**: Lucene-based BM25 text search
- **APOC**: Neo4j utility procedures

### AI Integration

- **Vercel AI SDK v6**: Unified interface for multiple LLM providers (`ai` package)
- **Provider Packages**: `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/cohere`, `@ai-sdk/mistral`, `@ai-sdk/openai-compatible`
- **MCP SDK**: `@modelcontextprotocol/sdk` for `.note()` tool integration
- **Zod**: Runtime schema validation for all LLM outputs

### Supported Providers

| Purpose        | Providers                                                   |
| -------------- | ----------------------------------------------------------- |
| Embedding      | OpenAI, Google, Cohere, Mistral, Ollama, OpenAI-compatible  |
| LLM (internal) | OpenAI, Anthropic, Google, Ollama, OpenAI-compatible        |
| Upstream Proxy | OpenAI, Anthropic, Ollama, Custom (with protocol selection) |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                            MEMENTO                                  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      SERVER (src/server/)                   │    │
│  │  • Hono app composition root                                │    │
│  │  • Mounts proxy routes (/) and MCP endpoint (/mcp)          │    │
│  │  • Client initialization (graph, embedding, LLM)            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│          ┌───────────────────┴───────────────────┐                  │
│          ▼                                       ▼                  │
│  ┌─────────────────────┐             ┌─────────────────────┐        │
│  │  PROXY (src/proxy/) │             │   MCP (src/mcp/)    │        │
│  │                     │             │                     │        │
│  │  • Request intercept│             │  • .note() tool     │        │
│  │  • Memory injection │             │  • Triggers         │        │
│  │  • Upstream routing │             │    consolidation    │        │
│  │  • Response forward │             │                     │        │
│  └──────────┬──────────┘             └──────────┬──────────┘        │
│             │                                   │                   │
│             ▼                                   ▼                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      CORE (src/core/)                       │    │
│  │                                                             │    │
│  │  ┌─────────────────────┐    ┌─────────────────────────────┐ │    │
│  │  │ Retrieval Pipeline  │    │  Consolidation Pipeline     │ │    │
│  │  │                     │    │                             │ │    │
│  │  │ LAND→ANCHOR→EXPAND  │    │  Branch A + Branch B        │ │    │
│  │  │ →DISTILL→TRACE      │    │  → Join → Write             │ │    │
│  │  └─────────────────────┘    └─────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   PROVIDERS (src/providers/)                │    │
│  │                                                             │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │    │
│  │  │  Embedding  │  │    Graph    │  │     LLM     │          │    │
│  │  │   Client    │  │   Client    │  │   Client    │          │    │
│  │  │             │  │   (Neo4j)   │  │             │          │    │
│  │  │  6 providers│  │  operations │  │  structured │          │    │
│  │  └─────────────┘  └─────────────┘  │   output    │          │    │
│  │                                    └─────────────┘          │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

**Server** (`src/server/`): Composition root. Creates Hono app, mounts routes, initializes clients.

**Proxy** (`src/proxy/`): Request interception, memory retrieval, context injection, upstream routing.

**MCP** (`src/mcp/`): Model Context Protocol server exposing `.note()` tool for explicit memory storage.

**Core** (`src/core/`): Domain logic - retrieval pipeline (LAND→ANCHOR→EXPAND→DISTILL→TRACE) and consolidation pipeline (parallel branches → join → write).

**Providers** (`src/providers/`): Infrastructure adapters for embedding, graph (Neo4j), and LLM services.

## Development Environment

### Required Tools

- **Bun** 1.x (runtime, package manager, test runner)
- **Docker** (for DozerDB container)

### Setup

```bash
bun install                    # Install dependencies
docker compose up -d           # Start Neo4j (DozerDB)
cp config/memento.example.json config/memento.json
# Edit config/memento.json, add API keys to .env
bun run start                    # Start server
```

### Configuration

- **Config file**: `config/memento.json` (JSON with `{env:VAR}` resolution)
- **API keys**: Stored in `.env` (gitignored), referenced in config via `{env:VAR}`
- **Schema validation**: Zod validates config at startup (fail-fast on invalid config)
- **Path aliases**: `@/*` maps to `./src/*`

### Default Port

`6366` (MEMO on T9 keyboard), configurable via `server.port` in config.

## Code Standards

### Linting & Formatting

- **Biome**: JS/TS/JSON/CSS (single quotes, semicolons, 2-space indent, 100 line width)
- **Prettier**: Markdown and YAML only (Biome doesn't support them yet)
- **Lefthook**: Pre-commit hooks auto-fix and re-stage changed files

### TypeScript

Strict mode with all safety flags enabled:

```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noUncheckedIndexedAccess": true,
  "noPropertyAccessFromIndexSignature": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true
}
```

### Naming Conventions

| Type             | Convention      | Example               |
| ---------------- | --------------- | --------------------- |
| Files            | kebab-case      | `entity-extractor.ts` |
| Types/Interfaces | PascalCase      | `EntityDecision`      |
| Functions        | camelCase       | `extractEntities()`   |
| Constants        | SCREAMING_SNAKE | `DEFAULT_CONFIG_PATH` |

### LLM Output Validation

All LLM outputs validated with Zod schemas before processing. Four-tier strategy with automatic fallback based on provider capabilities:

1. **Structured Output** (Tier 1) - Uses Vercel AI SDK's native `Output.object()` with `zodSchema()`. Most reliable when provider supports `json_schema` response format (OpenAI GPT-4+).

2. **Tool Calling** (Tier 2) - Defines a tool with the Zod schema and forces the model to call it. Supported by Anthropic, OpenAI, Google.

3. **JSON Mode** (Tier 3) - Uses `Output.json()` with schema description in prompt. Ensures valid JSON but doesn't enforce schema structure - validates with Zod after parsing.

4. **Prompt-Based** (Tier 4) - Universal fallback for any model. Schema in prompt, extracts JSON from response text (handles markdown code blocks, attempts truncated JSON salvaging).

## Testing Strategy

### Test Runner

Bun's built-in `bun test`

### Test Location

`tests/` directory (configured via `bunfig.toml`)

### Commands

```bash
bun test           # Run all tests
bun run check      # Lint + format + typecheck
bun run typecheck  # Type checking only
```

### Test Categories

- **Unit tests**: Individual functions and utilities
- **Agent tests**: LLM extraction/resolution logic with mock responses
- **Pipeline tests**: End-to-end workflow validation
- **Integration tests**: Neo4j operations with real database

## Deployment Process

### Local Development

```bash
docker compose up -d    # Start Neo4j (DozerDB)
bun run dev             # Hot reload enabled
```

### Production

```bash
docker compose up -d    # Start Neo4j (DozerDB)
bun run start           # Start server
```

### Infrastructure

- **DozerDB** container (Neo4j 5.26 + GDS + APOC)
- Data persisted to `~/.local/share/memento/neo4j/`
- Custom entrypoint script for Neo4j user/database setup
- Health check configured for container orchestration

## Performance Requirements

| Operation         | Target    |
| ----------------- | --------- |
| Retrieval latency | < 50ms    |
| Consolidation     | < 5s/note |
| Graph queries     | < 50ms    |
| Vector search     | < 20ms    |

## Security Considerations

### Credentials

- API keys stored in `.env` (gitignored)
- Config references keys via `{env:VAR}` pattern (e.g., `"apiKey": "{env:OPENAI_API_KEY}"`)
- No credentials in code or committed files

### API Key Handling

- Upstream API keys passed through proxy headers (never stored by Memento)
- Internal LLM/embedding keys resolved at startup from environment

### Network Isolation

- Neo4j runs in Docker with ports exposed only to localhost
- No external network access required for graph operations
- Graph data stored locally, user owns their knowledge
