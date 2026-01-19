# Development Log - Memento

**Project**: Memento - Transparent Memory Layer for AI Agents  
**Duration**: January 5-23, 2026  
**Total Time**: ~98 hours (ongoing)

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

### Day 6 (Jan 12) - Graph Provider Foundation [8h]

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

### Day 7 (Jan 13) - Graph Provider Operations [10h]

**Morning (10:00-13:30)**: Node & Edge Operations [3.5h]

Built CRUD operations for Entity, Memory, and Note nodes, plus structural edge creation.

**Challenge: Bulk Operations with UNWIND**

Creating entities, memories, and notes one at a time would be slow. Solution: Use Cypher's `UNWIND` to batch operations in a single query. MERGE for entities (upsert by name), CREATE for memories/notes (always new).

**Challenge: Dynamic SET Clauses for Updates**

Update operations need to only modify provided fields, not overwrite everything. Solution: Build SET clauses dynamically based on which fields are present in the update payload, preserving unspecified fields.

**Components Built**:

- `src/providers/graph/neo4j/operations/nodes.ts` - Entity/Memory/Note CRUD with bulk operations
- `src/providers/graph/neo4j/operations/edges.ts` - MENTIONS, EXTRACTED_FROM, INVALIDATES, ABOUT edges

**Afternoon (14:30-19:00)**: Search Operations & Query Repository [4.5h]

Built the search primitives (vector, fulltext, hybrid) and centralized Cypher query repository.

**Challenge: Hybrid Search with RRF**

Vector search finds semantically similar content, fulltext finds exact keywords. Need both for robust retrieval. Solution: Run vector and fulltext searches in parallel, combine results using Reciprocal Rank Fusion (RRF) which weights items by their rank in each list.

**Challenge: Centralized Query Repository**

Cypher queries scattered across operation files makes them hard to audit and maintain. Solution: `queries.ts` as a single source of truth with intent documentation explaining "why" for each query pattern.

**Components Built**:

- `src/providers/graph/neo4j/operations/search.ts` - Vector, fulltext, hybrid search, neighborhood traversal
- `src/providers/graph/neo4j/queries.ts` - All Cypher queries with semantic documentation

**Evening (19:30-21:30)**: GDS & Transaction Support [2h]

Built Graph Data Science operations and atomic transaction support.

**Challenge: Personalized PageRank Integration**

PPR requires an in-memory graph projection, running the algorithm, then cleanup. Must handle concurrent queries without graph name collisions. Solution: Generate unique graph names with timestamp + random suffix, always cleanup in finally block.

**Challenge: Atomic Consolidation Transactions**

Consolidation creates notes, entities, memories, and edges that must all succeed or all fail. Solution: `executeTransaction` wraps operations in Neo4j's managed transaction, with a `TransactionClient` interface that mirrors GraphClient's write operations.

**Components Built**:

- `src/providers/graph/neo4j/operations/gds.ts` - Personalized PageRank with graph projection lifecycle
- `src/providers/graph/neo4j/operations/transaction.ts` - Transaction-scoped write operations
- `src/providers/graph/neo4j/operations/index.ts` - Operations module re-exports

**Testing & Validation**:

- Tested bulk node creation with various batch sizes
- Verified hybrid search produces better results than either search alone
- Validated PPR graph projection cleanup on success and failure
- Tested transaction rollback on simulated errors

---

## Week 2: Core Pipelines (Jan 12-18)

### Day 8 (Jan 14) - Consolidation Core [7.5h]

**Morning (10:00-13:30)**: Types, Schemas, Config, Utils [3.5h]

Built the foundational types and utilities for the consolidation pipeline.

**Challenge: Zod Schema Validation for LLM Outputs**

LLM outputs need strict validation - entity types must match enum values, memory types must be valid, and all required fields must be present. Solution: Zod schemas with `.strict()` to reject unknown fields and detailed error messages for debugging.

**Challenge: Retry Logic for LLM Calls**

LLM calls can fail due to rate limits, transient errors, or validation failures. Solution: `callAgent` wrapper with exponential backoff retry logic, tracking stats for observability.

**Components Built**:

- `src/core/consolidation/types.ts` - TypeScript types for entity search, LLM config, pipeline stats
- `src/core/consolidation/schemas.ts` - Zod schemas for entity/memory extraction and resolution
- `src/core/consolidation/config.ts` - Default LLM configuration for consolidation phases
- `src/core/consolidation/utils.ts` - Utilities (assertDefined, callAgent, formatInput)

**Afternoon (14:00-18:00)**: Pipeline Orchestration [4h]

Built the main consolidation pipeline that coordinates all 8 phases.

**Challenge: Transaction Boundaries**

The write phase creates notes, entities, memories, and edges that must all succeed or all fail. Solution: Use GraphClient's `executeTransaction` to wrap all write operations in a single atomic transaction.

**Challenge: Pipeline Stats Tracking**

Need visibility into LLM call counts and retries for debugging and cost tracking. Solution: Pass mutable `PipelineStats` object through all phases, incrementing counters as operations execute.

**Components Built**:

- `src/core/consolidation/pipeline.ts` - Main pipeline orchestrating 8 phases with transaction support
- `src/core/consolidation/index.ts` - Public API exports

**Testing & Validation**:

- Verified Zod schemas reject invalid LLM outputs
- Tested retry logic with simulated failures
- Validated transaction rollback on write errors

### Day 9 (Jan 15) - LLM Agents [8h]

**Morning (10:00-13:00)**: Entity Extraction & Resolution [3h]

Built LLM agents for extracting and resolving entities from note content.

**Challenge: Entity Type Classification**

Entities need to be classified into specific types (PERSON, ORGANIZATION, CONCEPT, etc.) for proper graph modeling. Solution: Provide clear type definitions and examples in the prompt, with Zod enum validation to ensure only valid types are returned.

**Challenge: Entity Resolution Against Existing Graph**

Extracted entities might already exist in the graph with different names or descriptions. Solution: Pass search results to the resolver agent, which uses semantic similarity and context to determine if entities match existing ones.

**Components Built**:

- `src/core/consolidation/agents/entity-extractor.ts` - Extracts entities with type, name, description
- `src/core/consolidation/agents/entity-resolver.ts` - Resolves entities against search results
- `src/core/consolidation/agents/index.ts` - Agent module exports

**Afternoon (13:30-20:00)**: Memory Extraction & Resolution [5h]

Built LLM agents for extracting and consolidating memories.

**Challenge: Memory Type Classification**

Memories come in different types (FACT, PREFERENCE, EVENT, etc.) with different consolidation rules. Solution: Detailed type definitions with examples, and confidence scores to help prioritize during resolution.

**Challenge: Memory Consolidation Logic**

New memories might duplicate, update, or invalidate existing ones. Solution: Memory resolver agent compares extracted memories with retrieved context, determining the relationship (NEW, UPDATE, INVALIDATE) and providing reasoning.

**Challenge: HyDE for Better Retrieval**

Simple vector search might miss relevant memories due to vocabulary mismatch. Solution: HyDE (Hypothetical Document Embeddings) generates hypothetical memories that might exist, improving retrieval coverage.

**Components Built**:

- `src/core/consolidation/agents/memory-extractor.ts` - Extracts memories with type, content, entities
- `src/core/consolidation/agents/memory-resolver.ts` - Consolidates memories with existing ones
- `src/core/consolidation/agents/hyde-generator.ts` - Generates hypothetical documents for retrieval

**Testing & Validation**:

- Tested entity extraction with various note types
- Verified entity resolution correctly matches existing entities
- Validated memory consolidation logic with overlapping memories
- Tested HyDE generation improves retrieval recall

### Day 10 (Jan 16) - Pipeline Phases [8h]

**Morning (10:00-12:30)**: Entity Phases [2.5h]

Built pipeline phases for entity extraction, search, and resolution.

**Challenge: Batch Embedding for Entity Search**

Searching entities one at a time would be slow. Solution: Batch embed all "Name: Description" strings in a single call, then run hybrid search for each entity in parallel.

**Challenge: Embedding Reuse**

Entity embeddings are needed both for search and for writing to the graph. Solution: Return embeddings from search phase for reuse in write phase, avoiding redundant embedding calls.

**Components Built**:

- `src/core/consolidation/phases/extract-entities.ts` - Calls entity-extractor agent
- `src/core/consolidation/phases/search-entities.ts` - Batch embeds and searches entities
- `src/core/consolidation/phases/resolve-entities.ts` - Calls entity-resolver agent

**Afternoon (13:00-15:00)**: Memory Phases [2h]

Built pipeline phases for memory extraction and resolution.

**Components Built**:

- `src/core/consolidation/phases/extract-memories.ts` - Calls memory-extractor agent
- `src/core/consolidation/phases/resolve-memories.ts` - Calls memory-resolver agent

**Afternoon/Evening (15:30-19:30)**: Context Retrieval & Graph Write [3.5h]

Built the most complex phases: context retrieval and graph writing.

**Challenge: HyDE Integration with Retrieval Pipeline**

The retrieval pipeline provides good results, but HyDE can improve coverage by generating hypothetical memories. Solution: Run both in parallel and merge results, deduplicating by memory ID.

**Challenge: Atomic Graph Writes**

Writing notes, entities, memories, and edges must be atomic - all succeed or all fail. Solution: Use transaction-scoped operations, with proper error handling and rollback.

**Challenge: Entity Deduplication**

Multiple memories might reference the same entity. Solution: Deduplicate entities by name before writing, ensuring each entity is created only once.

**Challenge: Memory Invalidation**

When a memory invalidates an existing one, we need to create an INVALIDATES edge. Solution: Track invalidations during resolution and create edges in write phase.

**Components Built**:

- `src/core/consolidation/phases/retrieve-context.ts` - Combines retrieval pipeline with HyDE
- `src/core/consolidation/phases/write-graph.ts` - Atomic graph writes with deduplication
- `src/core/consolidation/phases/index.ts` - Phase module exports

**Testing & Validation**:

- Tested batch embedding reduces latency vs sequential
- Verified entity deduplication works correctly
- Validated transaction rollback on write errors
- Tested HyDE improves retrieval recall without duplicates

### Day 11 (Jan 17) - Retrieval Core [7h]

**Morning (10:00-13:30)**: Types, Config, Utils [3.5h]

Built the foundational types and configuration for the retrieval pipeline.

**Challenge: Multi-Format Output**

The retrieval pipeline needs to support both JSON (for programmatic access) and formatted text (for human readability). Solution: Separate formatting layer that transforms retrieval results into either structured JSON or readable text with proper indentation and sections.

**Challenge: Configurable Pipeline Phases**

Different use cases need different retrieval strategies - some prioritize speed, others prioritize diversity or provenance. Solution: Granular configuration for each phase (LAND, ANCHOR, EXPAND, DISTILL, TRACE) with sensible defaults based on research.

**Components Built**:

- `src/core/retrieval/types.ts` - TypeScript types for 5-phase pipeline, memory data, retrieval output
- `src/core/retrieval/config.ts` - Phase-specific configuration with research-backed defaults
- `src/core/retrieval/utils.ts` - Content normalization utilities

**Afternoon (14:00-18:00)**: Pipeline & Formatting [4h]

Built the main retrieval pipeline orchestration and output formatting.

**Challenge: Phase Orchestration**

The 5 phases (LAND → ANCHOR → EXPAND → DISTILL → TRACE) must execute sequentially, passing data between phases while maintaining type safety. Solution: Pipeline function that coordinates phases, with clear input/output contracts for each phase.

**Challenge: Provenance Tracking**

The LLM need to understand why memories were retrieved and how they're connected. Solution: TRACE phase reconstructs paths from query → entities → memories, showing the reasoning chain.

**Components Built**:

- `src/core/retrieval/pipeline.ts` - Main pipeline orchestrating 5 phases
- `src/core/retrieval/format.ts` - JSON and formatted text output with provenance
- `src/core/retrieval/index.ts` - Public API exports

**Testing & Validation**:

- Verified pipeline executes phases in correct order
- Tested JSON output matches schema
- Validated formatted text is human-readable with proper sections

### Day 12 (Jan 18) - Retrieval Algorithms [7.5h]

**Morning (10:00-13:00)**: Core Algorithms [3h]

Built the foundational algorithms for search result fusion and scoring.

**Challenge: RRF Performance Optimization**

The initial RRF implementation used `.find()` inside a loop over all result IDs, creating O(N\*M) complexity. With 100 results, this meant 10,000 operations. Solution: Pre-build Map lookups for both vector and fulltext results, reducing complexity to O(N) - a 50x performance improvement for typical result sets.

**Challenge: Score Distribution Alignment**

Vector search and fulltext search return scores with different distributions (e.g., vector: 0.7-0.95, fulltext: 1-50). Combining them directly would bias toward one source. Solution: Distribution alignment that normalizes mean and standard deviation before min-max scaling to 0-1 range.

**Components Built**:

- `src/core/retrieval/algorithms/fusion.ts` - RRF fusion with Map-based O(1) lookups
- `src/core/retrieval/algorithms/normalize.ts` - Distribution alignment and min-max normalization
- `src/core/retrieval/algorithms/similarity.ts` - Cosine similarity for vector comparisons
- `src/core/retrieval/algorithms/index.ts` - Algorithm module exports

**Afternoon (14:00-17:30)**: Advanced Algorithms [3.5h]

Built algorithms for diversity filtering and graph-aware ranking.

**Challenge: Diversity vs Relevance Trade-off**

Returning only the top-K most relevant memories can lead to redundancy - many similar memories about the same topic. Solution: MMR (Maximal Marginal Relevance) iteratively selects memories that balance relevance to the query with diversity from already-selected memories.

**Challenge: Semantic PPR Weighting**

Standard PPR treats all source nodes equally, but some anchor entities are more relevant to the query than others. Solution: Semantic PPR combines entity-query similarity scores with PPR scores, giving higher weight to paths through query-relevant entities.

**Components Built**:

- `src/core/retrieval/algorithms/mmr.ts` - Maximal Marginal Relevance for diversity
- `src/core/retrieval/algorithms/sem-ppr.ts` - Semantic Personalized PageRank
- `src/core/retrieval/algorithms/weights.ts` - Dynamic anchor weight calculation

**Testing & Validation**:

- Verified RRF Map optimization produces identical results with 50x speedup
- Tested distribution alignment handles different score ranges correctly
- Validated MMR increases diversity without sacrificing too much relevance
- Confirmed Semantic PPR prioritizes query-relevant paths

### Day 13 (Jan 19) - Retrieval Phases [7.5h]

**Morning (10:00-12:30)**: LAND & ANCHOR Phases [2.5h]

Implemented the initial search and entity weighting phases.

**Challenge: Heterogeneous Score Distribution Alignment**

The LAND phase merges vector search (cosine similarity: 0.7-0.95) with fulltext search (BM25 scores: 1-50). Combining these directly would bias heavily toward fulltext. Solution: Implemented z-score normalization that transforms both distributions to `{mean: 0.5, std: 0.2}` before fusion. Added coverage penalty that reduces weight for sparse result sets - if fulltext returns only 2 results while vector returns 50, fulltext weight drops from 0.3 to 0.12 (2/5 coverage × 0.3).

**Challenge: Three-Signal Anchor Weight Fusion**

ANCHOR phase needed to balance semantic relevance, memory density, and graph structure. High-degree hub entities (degree 10,000) were dominating specific semantic matches. Solution: Combined three signals with configurable weights: (1) entity-query cosine similarity, (2) average memory-query similarity for memories about that entity, (3) log-dampened degree centrality. The log(1 + degree) scaling prevents hubs from overwhelming - degree 10 → 2.4, degree 10,000 → 9.2, only 4x difference instead of 1000x. Added frequency threshold filtering (minMemories=2) to remove noise entities appearing in only 1 memory.

**Components Built**:

- `src/core/retrieval/phases/land.ts` - Vector/fulltext fusion with coverage penalty
- `src/core/retrieval/phases/anchor.ts` - Three-signal entity weighting
- `src/core/retrieval/phases/index.ts` - Phase module exports

**Afternoon (13:00-15:30)**: EXPAND & DISTILL Phases [2.5h]

Built graph traversal and diversity filtering with adaptive parameters.

**Challenge: GDS API Limitation Workaround**

Hit a frustrating limitation: Neo4j's GDS stream API doesn't support weighted source nodes for Personalized PageRank. The API accepts source node IDs but treats them equally, ignoring anchor weights. Solution: Compensated by filtering anchors to only high-weight entities (threshold-based) before passing to PPR, rather than soft-weighting all anchors. Added graceful handling for memories with missing embeddings - they keep their PPR structure score unchanged instead of failing.

**Challenge: Adaptive Lambda for MMR**

Fixed lambda (0.7) for MMR diversity was either too aggressive or too weak depending on query type. "my email address" returns [0.95, 0.42, 0.38] with 0.53 gap - clear winner exists, should favor relevance. "my coding preferences" returns [0.78, 0.75, 0.73, 0.71] with 0.04 gap - many similar results, should favor diversity. Solution: Implemented adaptive lambda based on score gap between top result and average. Gap > 0.3 → max lambda (favor relevance), gap < 0.1 → min lambda (favor diversity). The MMR algorithm is O(n²) but necessary for quality - iteratively selects items balancing relevance and max cosine similarity to already-selected set.

**Components Built**:

- `src/core/retrieval/phases/expand.ts` - PPR with weighted anchor workaround
- `src/core/retrieval/phases/distill.ts` - Adaptive MMR diversity filtering

**Afternoon/Evening (16:00-18:30)**: TRACE Phase [2.5h]

Built provenance reconstruction with parallel data fetching and personalization.

**Challenge: Parallel Data Fetching Performance**

TRACE needs entities, invalidations, provenance, and user info for each memory. Sequential queries would multiply latency. Solution: Used `Promise.all` to fetch four data sources simultaneously - `getMemoryAboutEntities`, `getMemoryInvalidates`, `getMemoryProvenance`, `getUser`. Added entity inclusion filtering - only entities actually referenced by returned memories appear in output, not all anchor entities from earlier phases.

**Challenge: Two-Hop Invalidation Chains**

Memories can invalidate other memories, which themselves invalidated earlier memories. Users need the full chain to understand why information is stale. Solution: Implemented recursive invalidation tracking - if Memory A invalidates Memory B (which invalidated Memory C), the output includes both hops with normalized content and timestamps. Added user entity personalization - substitutes actual user name for "User" entity and sorts entities with user first, then by frequency in returned memories.

**Components Built**:

- `src/core/retrieval/phases/trace.ts` - Parallel provenance with two-hop invalidations

**Testing & Validation**:

- Verified z-score normalization handles edge case where one search mode returns 0 results
- Tested adaptive lambda: queries with 0.53 score gap use λ=0.9 (relevance), 0.04 gap uses λ=0.3 (diversity)
- Validated MMR produces 1 high-level summary + 3 distinct milestone memories instead of 4 similar status reports
- Confirmed parallel TRACE fetching vs sequential queries (measured improvement in wall-clock time)
- Tested two-hop invalidation chains correctly reconstruct Memory A → B → C relationships

---

## Technical Decisions & Rationale

| Decision                             | Rationale                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Bun over Node.js**                 | Runs TypeScript directly, faster startup, built-in test runner                                      |
| **DozerDB over Neo4j Community**     | Multi-database support (need `memory` database, not locked to `neo4j`)                              |
| **Bundled OpenGDS**                  | Personalized PageRank for graph-aware retrieval in EXPAND phase                                     |
| **Biome over ESLint**                | 10-20x faster, single tool for linting + formatting                                                 |
| **Lefthook pre-commit**              | Auto-fix code on commit, consistent style without manual effort                                     |
| **Zod for config validation**        | Type-safe, composable schemas with excellent error messages                                         |
| **L2 normalization in client**       | Consistent cosine similarity regardless of provider normalization                                   |
| **4-tier structured output**         | Reliable schema validation across all llm providers with automatic fallback                         |
| **Provider-agnostic GraphClient**    | Domain-focused interface allows swapping Neo4j for other graph DBs later                            |
| **Centralized query repository**     | All Cypher in one file with intent docs makes auditing and maintenance easy                         |
| **HyDE for retrieval augmentation**  | Generates hypothetical documents to improve recall, covering vocabulary mismatches in vector search |
| **8-phase consolidation pipeline**   | Separates extraction, search, resolution, and writing for independent testing and clear boundaries  |
| **Batch embedding in consolidation** | Single API call for multiple entities reduces latency vs sequential embedding                       |

---

## Kiro CLI Usage Statistics

- **Steering Documents**: 4 (product.md, tech.md, structure.md, kiro-cli-reference.md)
- **Custom Prompts Created**: 1 (`@commit`)
- **Template Prompts**: 12 (from hackathon starter)
