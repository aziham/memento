# Product Overview

## Product Purpose

Memento is a transparent proxy that gives LLMs persistent, human-like memory through a knowledge graph. It intercepts LLM requests, retrieves relevant memories from past interactions, and injects them as context - making every AI conversation aware of user preferences, past decisions, and accumulated knowledge.

The problem: Every AI conversation starts from zero. Users explain their preferences, codebase patterns, and workflows repeatedly. The AI has "goldfish memory" - it forgets everything between sessions.

The solution: Memento sits between your LLM client and provider, automatically surfacing relevant memories on every request. Users explicitly store important knowledge via the MCP `.note()` tool, ensuring high-quality, curated memories rather than noisy automatic extraction.

### Human-Like Memory, Not Database Queries

Human memory doesn't feel like a database query. When you see a red door, you don't consciously search for "red door memories" — the memory of your childhood home just surfaces.

Memento replicates this through a multi-phase retrieval pipeline:

**LAND** — Cast a wide net using hybrid search:

- Vector similarity (cosine) finds semantically related memories
- Fulltext search (BM25) catches keyword matches
- RRF fusion combines both signals (70% vector, 30% fulltext)

**ANCHOR** — Identify starting points for graph traversal:

- Find entities most relevant to current conversation
- Weight by: semantic similarity (50%), memory-based similarity (30%), structural importance (20%)

**EXPAND** — Traverse the knowledge graph via SEM-PPR:

- Run Personalized PageRank from anchor entities
- Combine graph distance with semantic boost: `hybridScore = 0.5 × structureScore + 0.5 × semanticScore`
- Discover connected memories that pure vector search would miss

**DISTILL** — Select diverse, relevant memories:

- Fuse LAND and EXPAND scores
- Apply MMR (Maximal Marginal Relevance) to avoid redundant memories
- Adaptive diversity based on score distribution

**TRACE** — Format for injection with temporal explainability:

- Structure selected memories as XML for LLM context
- Include `valid_since` and `valid_until` timestamps
- Show invalidation chains with reasons (2-hop history)
- Link to source note provenance (when and what was originally stored)
- Entity associations for each memory

This gives the AI temporal explainability - it sees not just what's true now, but what was true before and why it changed.

The result: AI that "just remembers" rather than "looks up."

### Curated Knowledge, Not Noise

Automatic memory extraction from every conversation sounds appealing but produces garbage. Most chat turns are transient - questions, debugging, brainstorming - not worth remembering. Automatic extraction can't distinguish signal from noise.

Memento takes a different approach: **user-curated memory via `.note()`** mcp tool. When something matters, you tell the AI to remember it. The consolidation pipeline then does the heavy lifting:

**Branch A** — Retrieve existing context (runs in parallel):

- Embed the note content
- Search for related memories via hybrid search + HyDE augmentation
- Return existing knowledge that might conflict or relate

**Branch B** — Extract entities and memories from the note (runs in parallel):

- **Entity Extraction**: Identify people, projects, tools, concepts mentioned
- **Entity Resolution**: Match against existing entities or create new ones
- **Memory Extraction**: Parse structured facts with temporal awareness

**Join** — Cross-reference and resolve:

- LLM receives ALL extracted memories + ALL existing related memories
- Makes decisions: ADD (new), SKIP (duplicate), or INVALIDATE (contradiction)
- Temporal corrections handled automatically ("left company X" invalidates "works at X")

**Write** — Persist to graph:

- Embed memories for vector search
- Create nodes and relationships in Graph Database
- Link memories to entities they're about

The result: High-quality, structured knowledge - not a dump of every conversation.

## Target Users

- **Developers using AI coding assistants** who are tired of re-explaining codebase patterns, tech stack preferences, and coding conventions every session
- **Power users of local LLMs** (Ollama, LM Studio) who want persistent memory without vendor lock-in
- **Knowledge workers** (writers, researchers, analysts) who need AI to remember ongoing project context and style preferences across sessions
- **AI tool builders** looking for a drop-in memory layer without building a custom RAG system from scratch

## Key Features

1. **Transparent Proxy**: Supports OpenAI, Anthropic (native protocol), Ollama, and custom endpoints. Just change the endpoint URL - zero code changes required.

2. **Automatic Memory Retrieval**: On every request, the LAND→ANCHOR→EXPAND→DISTILL→TRACE pipeline finds relevant memories and injects them into context.

3. **Explicit Memory Storage**: Users call `.note()` via MCP to store important knowledge. User-curated for high quality and precision.

4. **Knowledge Graph Storage**: DozerDB (Neo4j + GDS) with vector indexes, fulltext indexes, and Graph Data Science for Personalized PageRank. Entities, memories, and relationships enable graph-aware retrieval.

5. **Intelligent Consolidation Pipeline**: Dual-branch parallel architecture that extracts entities, resolves against existing knowledge, detects contradictions, and handles temporal corrections.

6. **Multi-Provider Support**: Works with OpenAI, Anthropic, Ollama, and any OpenAI-compatible endpoint. Mix and match providers for embedding, LLM, and upstream.

7. **Temporal Awareness**: Memories track `validAt` timestamps. Corrections create `INVALIDATES` edges, preserving history while surfacing current truth.

## Business Objectives

- Eliminate repetitive context-setting in AI conversations
- Reduce user frustration from "AI amnesia"
- Enable truly personalized AI experiences where the AI knows your preferences, projects, and history
- Create portable AI memory - users own their knowledge graph, not locked into any provider
- Provide memory capabilities to local LLM users who can't use cloud-based memory features

## User Journey

1. **Setup (5 minutes)**
   - Clone repo, run `bun install` to install dependencies
   - Run `docker compose up -d` to start Neo4j
   - Add API keys to `.env`, configure providers in `config/memento.json` (uses `{env:VAR}` references)
   - Run `bun run start` to start Memento

2. **Configure Client**
   - Point LLM client to `http://localhost:6366/v1` instead of provider URL
   - Memento routes to upstream provider (OpenAI, Anthropic, Ollama) based on `memento.json` config
   - Configure MCP client to connect to `http://localhost:6366/mcp` for `.note()` tool

3. **Use Normally**
   - Chat with AI as usual - no workflow changes
   - Relevant memories automatically injected on every request
   - AI responses reflect accumulated knowledge

4. **Store Important Knowledge**
   - When something is worth remembering, tell the AI to note it or remember it
   - AI calls `.note("User prefers TypeScript over JavaScript")`
   - Consolidation pipeline extracts entities, resolves against existing knowledge, stores to graph

5. **Experience Continuity**
   - Next session, AI already knows your preferences
   - No need to re-explain context
   - AI feels like a persistent entity, not a stateless tool

## Success Criteria

- **Setup time**: < 5 minutes from clone to working proxy
- **Retrieval latency**: < 50ms added to request round-trip
- **Memory relevance**: > 95% of injected memories are contextually useful
- **Zero friction**: No changes to user's existing LLM workflow beyond endpoint URL
- **Reliability**: Graceful degradation if graph unavailable (proxy still forwards requests)
- **Quality over quantity**: User-curated memories via `.note()` ensure high signal-to-noise ratio
