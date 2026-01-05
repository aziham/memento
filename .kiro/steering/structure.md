# Project Structure

## Directory Layout

```
memento/
├── .kiro/                    # Kiro CLI configuration
│   ├── steering/             # Project knowledge (product, tech, structure)
│   └── prompts/              # Custom commands (@prime, @execute, etc.)
├── config/                   # Configuration files
│   ├── memento.json          # Main config (gitignored)
│   ├── memento.example.json  # Template for users to copy
│   └── memento.schema.json   # JSON Schema for config validation
├── plugins/                  # External plugins
│   └── neo4j/                # Neo4j GDS plugin (open-gds JAR)
├── scripts/                  # Helper scripts
│   └── neo4j-entrypoint.sh   # Neo4j initialization script
├── src/
│   ├── config/               # Config loading and validation
│   ├── core/                 # Domain logic (pipelines)
│   │   ├── consolidation/    # Memory storage pipeline
│   │   │   ├── agents/       # LLM agents for extraction/resolution
│   │   │   └── phases/       # Pipeline phase implementations
│   │   └── retrieval/        # Memory retrieval pipeline
│   │       ├── algorithms/   # Scoring algorithms (RRF, MMR, SEM-PPR)
│   │       └── phases/       # Pipeline phase implementations
│   ├── mcp/                  # MCP server (.note() tool)
│   ├── providers/            # Infrastructure adapters
│   │   ├── embedding/        # Vector embedding clients
│   │   ├── graph/            # Neo4j graph client
│   │   │   └── neo4j/        # Neo4j-specific implementation
│   │   │       └── operations/ # Modular graph operations
│   │   └── llm/              # LLM client with structured output
│   │       └── structured-output/ # 4-tier output strategies
│   ├── proxy/                # HTTP proxy layer
│   │   ├── injection/        # Memory context injection
│   │   ├── routes/           # HTTP route handlers
│   │   └── upstream/         # Provider-specific adapters
│   ├── server/               # Hono app composition
│   └── index.ts              # Entry point
├── tests/                    # Test files
├── docker-compose.yml        # Neo4j (DozerDB) container
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── biome.json                # Linter/formatter config
├── lefthook.yml              # Pre-commit hooks
├── bunfig.toml               # Bun test runner config
├── .env                      # API keys (gitignored)
├── .env.example              # Template for .env
└── .gitignore
```

## File Naming Conventions

| Type         | Convention   | Example               |
| ------------ | ------------ | --------------------- |
| Source files | kebab-case   | `entity-extractor.ts` |
| Test files   | \*.test.ts   | `fusion.test.ts`      |
| Index files  | index.ts     | `index.ts`            |
| Config files | config.ts    | `config.ts`           |
| Type files   | types.ts     | `types.ts`            |
| Schema files | schemas.ts   | `schemas.ts`          |
| Constants    | constants.ts | `constants.ts`        |

## Module Organization

### Providers (Infrastructure Layer)

External service integrations. Each provider follows the pattern:

```
providers/<service>/
├── types.ts      # Interface definitions
├── client.ts     # Implementation
├── factory.ts    # Creation with config
├── utils.ts      # Helper functions (optional)
└── index.ts      # Public exports
```

**Embedding Provider** (`src/providers/embedding/`):

- Wraps Vercel AI SDK embed functions
- L2 normalization for all vectors
- Supports 6 providers via factory

**Graph Provider** (`src/providers/graph/`):

- Neo4j client with modular operations
- Operations split into: nodes, edges, search, gds, user, transaction
- Schema management (constraints, indexes)

**LLM Provider** (`src/providers/llm/`):

- Structured output with 4-tier fallback strategy
- Each strategy in separate file under `structured-output/`

### Core (Domain Layer)

Business logic, independent of infrastructure:

**Consolidation** (`src/core/consolidation/`):

- `agents/`: LLM agents (entity-extractor, entity-resolver, memory-extractor, memory-resolver, hyde-generator)
- `phases/`: Pipeline phases (extract-entities, search-entities, resolve-entities, extract-memories, resolve-memories, retrieve-context, write-graph)
- `pipeline.ts`: Orchestrates parallel branches and join
- `schemas.ts`: Zod schemas for agent outputs
- `types.ts`: TypeScript interfaces

**Retrieval** (`src/core/retrieval/`):

- `algorithms/`: Scoring algorithms (fusion, mmr, sem-ppr, similarity, weights, normalize)
- `phases/`: Pipeline phases (land, anchor, expand, distill, trace)
- `pipeline.ts`: Orchestrates LAND→ANCHOR→EXPAND→DISTILL→TRACE
- `format.ts`: XML formatting for LLM injection

### Proxy (Application Layer)

HTTP proxy handling:

**Upstream** (`src/proxy/upstream/`):

- Provider-specific adapters (openai, anthropic, ollama, custom)
- Factory for creating appropriate client

**Injection** (`src/proxy/injection/`):

- `formatter.ts`: Converts retrieval output to XML
- `inject.ts`: Injects context into LLM request

**Routes** (`src/proxy/routes/`):

- `handlers.ts`: Core request/response handling
- `memory.ts`: Memory-related endpoints
- `query.ts`: Query endpoints

### Server (Composition Root)

Wires everything together:

- `index.ts`: Creates Hono app, mounts routes
- `clients.ts`: Initializes graph, embedding, LLM clients
- `proxy.ts`: Mounts proxy routes
- `mcp.ts`: Handles MCP endpoint

### Entry Point

`src/index.ts`: Starts the server with configured port.

## Configuration Files

| File                         | Purpose                                   |
| ---------------------------- | ----------------------------------------- |
| `config/memento.json`        | Main config (providers, models, settings) |
| `config/memento.schema.json` | JSON Schema for config validation         |
| `docker-compose.yml`         | Neo4j (DozerDB) container setup           |
| `biome.json`                 | Biome linter/formatter configuration      |
| `.prettierrc`                | Prettier config (MD/YAML only)            |
| `.prettierignore`            | Files Prettier should skip                |
| `tsconfig.json`              | TypeScript compiler configuration         |
| `lefthook.yml`               | Pre-commit hook definitions               |
| `bunfig.toml`                | Bun test runner configuration             |

## Documentation Structure

```
.kiro/
├── steering/
│   ├── product.md           # Product overview, features, users
│   ├── tech.md              # Technical architecture, stack
│   └── structure.md         # This file - project organization
└── prompts/
    ├── prime.md             # Load project context
    ├── plan-feature.md      # Plan new features
    ├── execute.md           # Execute plans
    ├── code-review.md       # Code review
    └── ...                  # Other custom prompts
```

## Asset Organization

### Neo4j Plugin

```
plugins/neo4j/
└── open-gds-2.13.4.jar      # Graph Data Science plugin
```

Mounted into Neo4j container at `/var/lib/neo4j/plugins/`.

### Scripts

```
scripts/
└── neo4j-entrypoint.sh      # Custom entrypoint for Neo4j setup
```

Creates user, database, and applies initial configuration.

## Build Artifacts

**None** - Bun runs TypeScript directly. No build step, no compiled output.

Files that are generated at runtime:

- `bun.lock` - Dependency lockfile
- `node_modules/` - Installed dependencies

## Environment-Specific Files

### Development

- `.env` - Local API keys (gitignored)
- `config/memento.json` - Local config (gitignored)
- `docker-compose.yml` - Local Neo4j instance

### Production

Same files, different values:

- `.env` - Production API keys
- `config/memento.json` - Production config (or use `MEMENTO_CONFIG` env var to point to different path)
- Neo4j connection configured for production instance

### Environment Variable Resolution

Config supports `{env:VAR}` pattern for environment variable injection:

```json
{
  "llm": {
    "apiKey": "{env:OPENAI_API_KEY}"
  }
}
```

Resolved at startup from `.env` or system environment.
