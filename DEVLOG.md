# Development Log - Memento

**Project**: Memento - Transparent Memory Layer for AI Agents  
**Duration**: January 5-23, 2026  
**Total Time**: ~20 hours (ongoing)

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

---

## Technical Decisions & Rationale

| Decision                         | Rationale                                                              |
| -------------------------------- | ---------------------------------------------------------------------- |
| **Bun over Node.js**             | Runs TypeScript directly, faster startup, built-in test runner         |
| **DozerDB over Neo4j Community** | Multi-database support (need `memory` database, not locked to `neo4j`) |
| **Bundled OpenGDS**              | Personalized PageRank for graph-aware retrieval in EXPAND phase        |
| **Biome over ESLint**            | 10-20x faster, single tool for linting + formatting                    |
| **Lefthook pre-commit**          | Auto-fix code on commit, consistent style without manual effort        |
| **Zod for config validation**    | Type-safe, composable schemas with excellent error messages            |

---

## Kiro CLI Usage Statistics

- **Steering Documents**: 4 (product.md, tech.md, structure.md, kiro-cli-reference.md)
- **Custom Prompts Created**: 1 (`@commit`)
- **Template Prompts**: 12 (from hackathon starter)
