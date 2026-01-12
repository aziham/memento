# Development Log - Memento

**Project**: Memento - Transparent Memory Layer for AI Agents  
**Duration**: January 5-23, 2026  
**Total Time**: ~43 hours (ongoing)

## Overview

Building a transparent proxy that gives LLMs persistent, human-like memory through a knowledge graph. Unlike typical RAG systems that dump everything, Memento uses a sophisticated retrieval pipeline (LAND→ANCHOR→EXPAND→DISTILL→TRACE) and user-curated consolidation via the `.note()` MCP tool.

---

## Development Philosophy

**Test Before Integrate**: Each component is validated in isolation before being added to the main project:

1. **Research Phase**: Document the technique, understand tradeoffs
2. **Lab Phase**: Prototype and test in isolation (`lab/` directory - not committed)
3. **Validation Phase**: Run benchmarks, test edge cases, compare alternatives
4. **Implementation Phase**: Port proven code to `src/` with confidence

Lab files are intentionally kept out of the repository to maintain a clean project structure. Only production-ready, validated code gets committed.

This approach ensures the main codebase remains stable while allowing aggressive experimentation. For example, DozerDB and OpenGDS were tested separately - verifying multi-database support and Personalized PageRank functionality - before being added to the project's infrastructure.

---

## Week 1: Foundation & Planning (Jan 5-11)

### Day 1 (Jan 5) - Kiro Configuration & Project Setup [8h]

**Morning (9:00-12:30)**: Kiro CLI Setup [3.5h]

- Created steering documents for project consistency
  - `product.md` - Human-like memory philosophy, retrieval/consolidation pipelines
  - `tech.md` - Bun/Hono/DozerDB stack, 4-tier LLM validation strategy
  - `structure.md` - Project layout and module organization
- Set up custom prompts
  - `commit.md` - Custom prompt for commit style conventions
  - Copied 12 template prompts from hackathon starter
- Initial DEVLOG setup
- **Kiro Usage**: Created comprehensive steering docs to maintain consistency

**Afternoon (14:00-18:30)**: Project Configuration [4.5h]

- Set up TypeScript with strict mode and all safety flags:
  - `noUncheckedIndexedAccess` - Catches undefined array access
  - `noPropertyAccessFromIndexSignature` - Forces explicit bracket notation
  - `noImplicitOverride` - Prevents accidental method shadowing
- Configured Biome for linting/formatting (Rust-based, faster than ESLint)
- Added Prettier for Markdown/YAML only (Biome doesn't support them yet)
- Set up Lefthook for pre-commit hooks (auto-fix and re-stage)
- Tested all configurations to ensure they work together
- **Decision**: Bun over Node.js - runs TypeScript directly, no build step, faster startup

### Day 2 (Jan 6) - Docker & Neo4j Infrastructure [9h]

**Morning/Afternoon (10:00-19:00)**: Graph Database Setup

**Key Decision: DozerDB over Neo4j Community**

Neo4j Community Edition has a significant limitation: it only supports a single database named `neo4j`. For Memento, I wanted a dedicated `memory` database to keep knowledge graph data isolated. More importantly, I wanted access to as many premium features as possible for future versions of Memento - multi-database support, advanced indexes, and enterprise security features.

Tested DozerDB in isolation first - verified multi-database creation worked before committing to this approach. DozerDB adds enterprise features to Community Edition:

- Multi-database support (we use `memory` database)
- Same Cypher, same drivers, 100% compatible
- Free and open source (GPL license)

**Key Decision: Bundling OpenGDS Plugin**

The retrieval pipeline needs Personalized PageRank (PPR) for the EXPAND phase. Tested the plugin separately to confirm it integrates correctly with DozerDB.

Why PPR matters:

```
Regular PageRank:      "What nodes are globally important?"
Personalized PageRank: "What nodes are important FROM these starting points?"
```

When retrieving memories, we start from anchor entities (e.g., "React", "TypeScript") and need to find related memories. PPR walks the graph from those anchors and ranks nodes by their reachability - a memory connected to many React-related entities ranks higher than one with few connections.

Without PPR, we'd be limited to simple BFS which treats all nodes at the same distance equally. PPR considers graph structure, not just hop count.

**Challenge: Custom User Setup**

Neo4j starts with a default `neo4j` user. I wanted a custom `memento` user with the default removed for cleaner security.

**Solution**: Created `scripts/neo4j-entrypoint.sh` that:

1. Starts Neo4j in background
2. Waits for it to be ready
3. Creates custom user with admin privileges
4. Removes default `neo4j` user
5. Marks initialization complete (prevents re-running)

**Testing & Validation**:

- Verified container starts correctly with custom entrypoint
- Tested database creation and switching
- Confirmed GDS procedures load and execute properly
- Ran sample PageRank queries to validate OpenGDS integration

### Day 3 (Jan 8) - Configuration System [3h]

**Morning (10:00-13:00)**: Config Architecture

Built a flexible configuration system supporting multiple providers without code changes.

**Challenge: Environment Variables in URLs**

Cloudflare's API embeds the Account ID in the URL path, not as a header. Most config systems only resolve env vars for standalone values. Solution: resolve `{env:VAR}` patterns on raw JSON text before parsing, so it works anywhere - API keys, URLs, or nested structures.

**Challenge: Provider-Specific Validation**

Each provider has different requirements - OpenAI needs `apiKey` but forbids `baseUrl`, while `openai-compatible` requires both. Simple required/optional validation can't express these rules. Solution: Zod's `superRefine()` for conditional validation based on selected provider.

**Components Built**:

- `src/config/schema.ts` - Zod schema with conditional validation
- `src/config/config.ts` - Config loader with `{env:VAR}` resolution
- `config/memento.schema.json` - JSON Schema for IDE autocompletion

**Testing & Validation**:

- Tested multiple provider combinations in lab
- Verified env var resolution in URLs works correctly
- Validated clear error messages for misconfigurations

### Day 4 (Jan 9) - Embedding Provider [5h]

**Afternoon (12:00-17:00)**: Multi-Provider Embedding System

Built a unified embedding provider supporting 6 backends through Vercel AI SDK.

**Challenge: Provider-Specific Dimension Handling**

Different providers handle embedding dimensions differently. OpenAI uses `dimensions`, Google uses `outputDimensionality`, and Cohere/Mistral don't support dimension reduction at all. Solution: Provider-aware factory that applies dimension settings only where supported, using Vercel AI SDK's `wrapEmbeddingModel` middleware.

**Challenge: L2 Normalization for Cosine Similarity**

Neo4j's vector index uses cosine similarity, which works best with normalized vectors. Not all embedding providers return L2-normalized output. Solution: Always normalize embeddings in the client before returning, ensuring consistent behavior regardless of provider.

**Components Built**:

- `src/providers/embedding/factory.ts` - Provider factory with dimension handling
- `src/providers/embedding/client.ts` - Wrapper with L2 normalization
- `src/providers/embedding/types.ts` - EmbeddingClient interface
- `src/providers/embedding/utils.ts` - L2 normalization utility

**Providers Supported**:

- OpenAI, Google, Cohere, Mistral (native SDK)
- Ollama (via OpenAI-compatible endpoint)
- Any OpenAI-compatible API (Cloudflare, Cerebras, etc.)

**Testing & Validation**:

- Tested dimension handling with OpenAI and Google
- Verified L2 normalization produces unit vectors
- Validated Ollama and Cloudflare via openai-compatible

### Day 5 (Jan 10) - LLM Provider & Structured Output [9.5h]

**Morning (11:00-14:30)**: Multi-Provider LLM System [3.5h]

Built a unified LLM provider using Vercel AI SDK v6 with direct provider packages (no gateway).

**Challenge: Provider-Specific Model Instantiation**

Each provider has different SDK initialization patterns - OpenAI uses `createOpenAI`, Anthropic uses `createAnthropic`, etc. Ollama doesn't have a native SDK but supports OpenAI-compatible endpoints.

Solution: Factory pattern that maps provider config to the correct AI SDK package:

- Native SDKs for OpenAI, Anthropic, Google
- `createOpenAICompatible` for Ollama (via `/v1` endpoint) and other compatible APIs

**Components Built**:

- `src/providers/llm/factory.ts` - Provider factory with capability detection
- `src/providers/llm/client.ts` - Unified client (`complete`, `completeJSON`, `generateWithTools`)
- `src/providers/llm/types.ts` - LLMClient interface, Message types, CompletionOptions

**Afternoon/Evening (16:00-22:00)**: 4-Tier Structured Output Strategy [6h]

**Challenge: Provider-Specific Structured Output Support**

Different LLM providers support different methods for structured output:

- OpenAI: Native structured outputs (`response_format` with `json_schema`)
- Anthropic: Tool calling only (no native structured output or JSON mode)
- Google: JSON mode with `response_schema`
- Ollama: Varies by model, often only JSON mode

A single approach doesn't work across all providers. Solution: A tiered strategy pattern that tries methods in order of reliability, falling back automatically when one fails.

**The 4-Tier Strategy**:

1. **Structured Output** (Tier 1) - Native API support via `Output.object()`, most reliable
2. **Tool Calling** (Tier 2) - Schema as tool definition, model forced to call with structured args
3. **JSON Mode** (Tier 3) - `Output.json()` ensures valid JSON, schema in prompt for guidance
4. **Prompt-Based** (Tier 4) - Schema in prompt, extract JSON from markdown/raw text

**Challenge: Provider-Specific Strategy Ordering**

Each provider has an optimal strategy order based on what works best:

- OpenAI: Structured → Tool → JSON → Prompt
- Anthropic: Tool → Prompt (no JSON mode or native structured output)
- Google: JSON → Tool → Prompt
- Ollama/Compatible: Try all in order (capabilities vary by model)

**Challenge: Validation Failures**

Even with the right method, models sometimes produce invalid output. Solution: Retry with error feedback - on validation failure, append the error to the conversation and retry (up to 2 retries per strategy). If all retries fail, fall back to the next strategy.

**Challenge: JSON Extraction from Free-form Text**

The prompt-based fallback receives raw text that may contain JSON wrapped in markdown, embedded in explanations, or truncated. Solution: Multi-pass extraction:

1. Markdown code blocks (` ```json ... ``` `)
2. Raw JSON objects (with brace-matching for nested structures)
3. JSON arrays
4. Truncated JSON salvaging (find last valid closing bracket)

**Components Built**:

- `src/providers/llm/structured-output/index.ts` - Strategy registry and executor with retry logic
- `src/providers/llm/structured-output/types.ts` - Strategy interface, ProviderCapabilities
- `src/providers/llm/structured-output/structured-output.ts` - Tier 1: Native structured output
- `src/providers/llm/structured-output/tool-calling.ts` - Tier 2: Tool calling with forced choice
- `src/providers/llm/structured-output/json-mode.ts` - Tier 3: JSON mode
- `src/providers/llm/structured-output/prompt-based.ts` - Tier 4: Prompt-based with extraction

**Providers Supported**:

- OpenAI, Anthropic, Google (native SDK via `@ai-sdk/*`)
- Ollama (via OpenAI-compatible endpoint at `/v1`)
- Any OpenAI-compatible API (Cloudflare Workers AI, Cerebras, etc.)

**Testing & Validation**:

- Tested all 4 strategies in isolation with different schemas
- Verified fallback chain works when strategies fail
- Validated retry with error feedback improves success rate
- Tested JSON extraction with various markdown formats and truncated responses

### Day 6 (Jan 12) - Graph Provider Foundation [8.5h]

**Morning (10:00-13:00)**: Graph Provider Types & Factory [3h]

Built the foundational types and interfaces for the graph persistence layer.

**Challenge: Designing a Provider-Agnostic Interface**

The GraphClient interface needs to support different graph database backends while exposing the right primitives for the retrieval and consolidation pipelines. Solution: Focus on domain operations (createEntities, searchVector, runPersonalizedPageRank) rather than raw Cypher, allowing future backends (e.g., FalkorDB, Memgraph) without changing Core.

**Components Built**:

- `src/providers/graph/types.ts` - GraphClient interface, Entity/Memory/Note types, edge types
- `src/providers/graph/factory.ts` - Factory function for creating graph clients
- `src/providers/graph/utils.ts` - Utilities (UUID v7, timestamps, Lucene sanitization, RRF fusion)
- `src/providers/graph/index.ts` - Module exports

**Afternoon (14:00-17:30)**: Neo4j Client Foundation [3.5h]

Built the foundational Neo4j-specific modules for schema, error handling, and record mapping.

**Challenge: Error Classification for Retry Logic**

Neo4j errors need to be classified into retryable (transient) vs non-retryable (constraint violations). Solution: `classifyNeo4jError()` maps Neo4j error codes to standardized `GraphErrorType` enum, enabling consistent retry behavior across all operations.

**Challenge: Idempotent Schema Initialization**

Schema creation (constraints, indexes) needs to be safe to run multiple times, including during concurrent startup. Solution: All schema DDL uses `IF NOT EXISTS` clauses, with additional error catching for race conditions where another instance creates the same element.

**Components Built**:

- `src/providers/graph/neo4j/constants.ts` - Labels, relationship types, index names
- `src/providers/graph/neo4j/errors.ts` - Error classification, retry logic, session lifecycle
- `src/providers/graph/neo4j/mapping.ts` - Neo4j record → TypeScript object translators
- `src/providers/graph/neo4j/schema.ts` - Schema initialization (constraints, vector/fulltext indexes)
- `src/providers/graph/neo4j/index.ts` - Neo4j module exports

**Evening (18:00-19:30)**: Neo4j Client & User Operations [1.5h]

Built the main Neo4j GraphClient class and User node operations.

**Challenge: Singleton User Node**

The User node represents "the person talking to the AI" with a fixed ID of 'USER'. Needed idempotent creation via MERGE semantics for `getOrCreateUser`, while `createUser` should only be called once during `memento init`.

**Components Built**:

- `src/providers/graph/neo4j/client.ts` - Neo4jGraphClient implementing GraphClient interface
- `src/providers/graph/neo4j/operations/user.ts` - User CRUD operations

**Testing & Validation**:

- Verified schema initialization is idempotent
- Tested error classification with various Neo4j error types
- Validated User node creation and retrieval

---

## Technical Decisions & Rationale

| Decision                          | Rationale                                                                   |
| --------------------------------- | --------------------------------------------------------------------------- |
| **Bun over Node.js**              | Runs TypeScript directly, faster startup, built-in test runner              |
| **DozerDB over Neo4j Community**  | Multi-database support (need `memory` database, not locked to `neo4j`)      |
| **Bundled OpenGDS**               | Personalized PageRank for graph-aware retrieval in EXPAND phase             |
| **Biome over ESLint**             | 10-20x faster, single tool for linting + formatting                         |
| **Lefthook pre-commit**           | Auto-fix code on commit, consistent style without manual effort             |
| **Zod for config validation**     | Type-safe, composable schemas with excellent error messages                 |
| **L2 normalization in client**    | Consistent cosine similarity regardless of provider normalization           |
| **4-tier structured output**      | Reliable schema validation across all llm providers with automatic fallback |
| **Provider-agnostic GraphClient** | Domain-focused interface allows swapping Neo4j for other graph DBs later    |

---

## Kiro CLI Usage Statistics

- **Steering Documents**: 4 (product.md, tech.md, structure.md, kiro-cli-reference.md)
- **Custom Prompts Created**: 1 (`@commit`)
- **Template Prompts**: 12 (from hackathon starter)
