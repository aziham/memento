---
description: Verify implementation follows Memento architectural patterns
allowed-tools: Read, Glob, Grep
---

# Validate Architecture

## Objective

Review recent changes to ensure they follow Memento's architectural principles. This is a read-only validation that catches issues before they become technical debt.

## Memento Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       APPLICATION LAYER                          │
│  ┌─────────────────────────┐  ┌─────────────────────────┐       │
│  │     src/server/         │  │      src/index.ts       │       │
│  │  Hono app, routes,      │  │    Entry point          │       │
│  │  client initialization  │  │                         │       │
│  └─────────────────────────┘  └─────────────────────────┘       │
├─────────────────────────────────────────────────────────────────┤
│                       INTERFACE LAYER                            │
│  ┌─────────────────────────┐  ┌─────────────────────────┐       │
│  │      src/proxy/         │  │       src/mcp/          │       │
│  │  HTTP proxy routes,     │  │  MCP tools for agents   │       │
│  │  memory injection       │  │                         │       │
│  └─────────────────────────┘  └─────────────────────────┘       │
├─────────────────────────────────────────────────────────────────┤
│                        DOMAIN LAYER                              │
│  ┌──────────────────────────────────────────────────────���────┐  │
│  │                      src/core/                             │  │
│  │  ┌─────────────────────┐  ┌─────────────────────────────┐ │  │
│  │  │    retrieval/       │  │      consolidation/         │ │  │
│  │  │  LAND→ANCHOR→EXPAND │  │  Extract→Resolve→Write      │ │  │
│  │  │  →DISTILL→TRACE     │  │                             │ │  │
│  │  └─────────────────────┘  └─────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                     INFRASTRUCTURE LAYER                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   src/providers/                           │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────┐             │  │
│  │  │embedding/│  │   graph/     │  │   llm/   │             │  │
│  │  │ OpenAI,  │  │  neo4j/      │  │ OpenAI,  │             │  │
│  │  │ Ollama   │  │  operations  │  │ Anthropic│             │  │
│  │  └──────────┘  └──────────────┘  └──────────┘             │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                     CONFIGURATION LAYER                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    src/config/                             │  │
│  │    Zod schemas, config loading, env resolution             │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Dependency Rules

Dependencies flow **downward only**:

| Layer          | Can Import From                | Cannot Import From             |
| -------------- | ------------------------------ | ------------------------------ |
| Application    | All layers                     | -                              |
| Interface      | Domain, Infrastructure, Config | Application                    |
| Domain         | Infrastructure, Config         | Application, Interface         |
| Infrastructure | Config                         | Application, Interface, Domain |
| Config         | External packages only         | All internal layers            |

## Architectural Principles

### 1. Dependency Injection

Components receive dependencies as parameters, not via imports.

**Correct:**

```typescript
export async function land(
  input: LandInput,
  deps: { graphClient: GraphClient }
): Promise<LandOutput> {
  const results = await deps.graphClient.searchVector(...);
}
```

**Incorrect:**

```typescript
import { graphClient } from '@/providers/graph';

export async function land(input: LandInput): Promise<LandOutput> {
  const results = await graphClient.searchVector(...);
}
```

### 2. Interface Segregation

Providers expose minimal interfaces. Core logic depends on interfaces, not implementations.

**Correct:**

```typescript
// Core depends on interface
interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
}

// Provider implements interface
function createOpenAIEmbeddingClient(): EmbeddingClient { ... }
```

### 3. Single Responsibility

Each module has one reason to change.

| Module                  | Responsibility                       |
| ----------------------- | ------------------------------------ |
| `retrieval/algorithms/` | Scoring and ranking math             |
| `retrieval/phases/`     | Pipeline step orchestration          |
| `providers/embedding/`  | Vector embedding generation          |
| `providers/graph/`      | Graph database operations            |
| `proxy/injection/`      | Memory formatting and injection      |
| `config/`               | Configuration loading and validation |

### 4. Error Boundaries

Errors are handled at appropriate boundaries.

| Layer     | Error Handling                                     |
| --------- | -------------------------------------------------- |
| Proxy     | Catch, log, return gracefully (don't crash server) |
| Pipelines | Catch, log, continue with degraded functionality   |
| Providers | Throw with context (caller decides handling)       |
| Config    | Fail fast with clear message                       |

### 5. Type Safety

All public APIs have full TypeScript types.

- No `any` in public interfaces
- Zod schemas for all LLM outputs
- Zod schemas for config validation
- Explicit return types on exported functions

### 6. Pure Core

Domain logic (algorithms) should be pure functions.

- No side effects
- No external state
- Same input → same output
- Easy to test

## Validation Checklist

### Layer Dependencies

Run these checks to verify dependencies:

```bash
# Providers should NOT import from core, proxy, or mcp
grep -r "from '@/core" src/providers/ && echo "VIOLATION: Provider imports core"
grep -r "from '@/proxy" src/providers/ && echo "VIOLATION: Provider imports proxy"
grep -r "from '@/mcp" src/providers/ && echo "VIOLATION: Provider imports mcp"

# Core should NOT import from proxy or mcp
grep -r "from '@/proxy" src/core/ && echo "VIOLATION: Core imports proxy"
grep -r "from '@/mcp" src/core/ && echo "VIOLATION: Core imports mcp"

# Config should only import external packages
grep -r "from '@/" src/config/ | grep -v "from '@/config" && echo "CHECK: Config imports internal"
```

### Dependency Injection

Check that phases and pipelines use injected dependencies:

```bash
# Look for direct client imports in core/
grep -r "import.*Client.*from '@/providers" src/core/
# Should only see type imports, not value imports
```

### Type Safety

```bash
# Run type checker
bun run typecheck

# Check for 'any' usage
grep -r ": any" src/ --include="*.ts" | grep -v "node_modules"
```

### Error Handling

Check proxy routes for try-catch:

```bash
# Proxy handlers should have error handling
grep -A 20 "app.post" src/proxy/routes/ | grep -E "(try|catch)"
```

### Test Coverage

```bash
# Run tests
bun test

# Check for untested files
find src/core -name "*.ts" | while read f; do
  test_file="tests/${f#src/}"
  test_file="${test_file%.ts}.test.ts"
  [ ! -f "$test_file" ] && echo "Missing test: $test_file"
done
```

## Common Violations

### Violation: Circular Dependencies

**Symptom:** Runtime error or undefined values

**Example:**

```typescript
// a.ts imports from b.ts
// b.ts imports from a.ts
```

**Fix:** Extract shared code to third module, or restructure.

### Violation: Provider Importing Core

**Symptom:** `grep -r "from '@/core" src/providers/` returns matches

**Fix:** Core should depend on provider interfaces, not vice versa.

### Violation: Direct Client Import in Phase

**Symptom:** Phase file has `import { graphClient } from '@/providers/graph'`

**Fix:** Add to phase deps parameter, inject from pipeline.

### Violation: Unhandled Errors in Proxy

**Symptom:** Server crashes on bad request

**Fix:** Wrap handler in try-catch, return error response.

### Violation: `any` in Public API

**Symptom:** Function signature has `: any` or `as any`

**Fix:** Define proper types, or use `unknown` with type guards.

## Review Output Format

After reviewing, document findings:

```markdown
## Architecture Review

**Date:** YYYY-MM-DD
**Scope:** [Files reviewed or "recent changes"]

### Summary

- Violations found: X
- Warnings: Y
- Passed checks: Z

### Violations

#### [Category]: Brief description

- **Location:** `src/path/file.ts:line`
- **Issue:** What's wrong
- **Fix:** How to fix it

### Warnings

#### [Category]: Brief description

- **Location:** `src/path/file.ts`
- **Concern:** What might be problematic
- **Suggestion:** Recommended improvement

### Passed

- [x] Layer dependencies correct
- [x] Dependency injection used
- [x] Type safety maintained
- [x] Error handling present
- [x] Tests exist for new code
```

## Automated Validation

Run all checks:

```bash
# Type checking
bun run typecheck

# Linting
bun run check:biome

# Tests
bun test

# Full check
bun run check
```

All must pass before merging.
