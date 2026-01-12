---
description: Define Neo4j schema elements (nodes, edges, indexes)
argument-hint: [element-type] [name]
---

# Setup Neo4j Schema: $ARGUMENTS

## Objective

Define a new graph schema element: `$1` named `$2`. The knowledge graph stores entities, memories, and their relationships, enabling graph-based retrieval.

## Memento Graph Design

### Design Philosophy

Memento is **memory-centric**, not entity-centric:

- **Memories are first-class nodes** - Rich natural language facts
- **Entities are connection points** - People, projects, technologies mentioned in memories
- **Relationships emerge through shared context** - Memories connect entities, not direct entity-to-entity edges

This enables LLM reasoning over rich context rather than sparse triples.

### Core Schema

```
┌─────────────────────────────────────────────────────────────────┐
│                         NODE TYPES                               │
├────────────────────���────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐       │
│  │  User   │    │ Entity  │    │ Memory  │    │  Note   │       │
│  │ (1 per  │    │ (people,│    │ (facts  │    │ (raw    │       │
│  │  graph) │    │  orgs,  │    │  about  │    │  input) │       │
│  │         │    │  tech)  │    │  world) │    │         │       │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘       │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                         EDGE TYPES                               │
├────────────────────────────────────────���────────────────────────┤
│                                                                  │
│  Memory ──ABOUT──► Entity/User    "Memory is about this entity" │
│  Memory ──EXTRACTED_FROM──► Note  "Memory came from this note"  │
│  Note ──MENTIONS──► Entity        "Note mentions this entity"   │
│  Memory ──INVALIDATES──► Memory   "New fact supersedes old"     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Node Definitions

### User Node

Singleton node representing the user. All first-person references resolve here.

```typescript
interface User {
  id: string; // UUID
  name: string; // "Hamza"
  description?: string; // "Software engineer interested in AI"
  embedding?: number[]; // Vector of description
}
```

**Cypher:**

```cypher
CREATE (u:User {
  id: randomUUID(),
  name: $name,
  description: $description,
  embedding: $embedding
})
```

### Entity Node

Named entities extracted from notes. Seven types:

```typescript
type EntityType =
  | 'Person'
  | 'Organization'
  | 'Project'
  | 'Technology'
  | 'Location'
  | 'Event'
  | 'Concept';

interface Entity {
  id: string;
  name: string; // "TypeScript"
  type: EntityType; // "Technology"
  description: string; // "A typed superset of JavaScript"
  embedding: number[]; // Vector of "Name: Description"
  isWellKnown: boolean; // true for famous entities
}
```

**Cypher:**

```cypher
CREATE (e:Entity {
  id: randomUUID(),
  name: $name,
  type: $type,
  description: $description,
  embedding: $embedding,
  isWellKnown: $isWellKnown
})
```

### Memory Node

Extracted facts in third-person natural language.

```typescript
interface Memory {
  id: string;
  content: string; // "USER prefers TypeScript over JavaScript"
  embedding: number[]; // Vector for semantic search
  validAt: string; // ISO timestamp when fact became true
  invalidAt?: string; // ISO timestamp when fact was superseded
}
```

**Cypher:**

```cypher
CREATE (m:Memory {
  id: randomUUID(),
  content: $content,
  embedding: $embedding,
  validAt: $validAt
})
```

### Note Node

Raw input from `.note()` tool. Preserves provenance.

```typescript
interface Note {
  id: string;
  content: string; // Original user input
  timestamp: string; // When note was created
}
```

**Cypher:**

```cypher
CREATE (n:Note {
  id: randomUUID(),
  content: $content,
  timestamp: $timestamp
})
```

## Edge Definitions

### ABOUT Edge

Connects Memory to what it's about.

```cypher
// Memory about an Entity
MATCH (m:Memory {id: $memoryId})
MATCH (e:Entity {id: $entityId})
CREATE (m)-[:ABOUT]->(e)

// Memory about User
MATCH (m:Memory {id: $memoryId})
MATCH (u:User)
CREATE (m)-[:ABOUT]->(u)
```

### EXTRACTED_FROM Edge

Provenance: which Note a Memory came from.

```cypher
MATCH (m:Memory {id: $memoryId})
MATCH (n:Note {id: $noteId})
CREATE (m)-[:EXTRACTED_FROM]->(n)
```

### MENTIONS Edge

Note mentions Entity (before extraction).

```cypher
MATCH (n:Note {id: $noteId})
MATCH (e:Entity {id: $entityId})
CREATE (n)-[:MENTIONS]->(e)
```

### INVALIDATES Edge

Temporal correction: new Memory supersedes old.

```typescript
interface InvalidatesProps {
  reason: string; // "USER changed jobs"
  invalidatedAt: string; // ISO timestamp
}
```

```cypher
MATCH (new:Memory {id: $newMemoryId})
MATCH (old:Memory {id: $oldMemoryId})
CREATE (new)-[:INVALIDATES {
  reason: $reason,
  invalidatedAt: $invalidatedAt
}]->(old)

// Also mark old memory as invalid
SET old.invalidAt = $invalidatedAt
```

## Index Definitions

### Vector Indexes

Enable fast semantic search via HNSW.

```cypher
// Memory embeddings
CREATE VECTOR INDEX memory_embedding IF NOT EXISTS
FOR (m:Memory) ON (m.embedding)
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
}

// Entity embeddings
CREATE VECTOR INDEX entity_embedding IF NOT EXISTS
FOR (e:Entity) ON (e.embedding)
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
}

// User embedding
CREATE VECTOR INDEX user_embedding IF NOT EXISTS
FOR (u:User) ON (u.embedding)
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
}
```

### Fulltext Indexes

Enable BM25 text search.

```cypher
// Entity name search
CREATE FULLTEXT INDEX entity_fulltext IF NOT EXISTS
FOR (e:Entity) ON EACH [e.name, e.description]

// Memory content search
CREATE FULLTEXT INDEX memory_fulltext IF NOT EXISTS
FOR (m:Memory) ON EACH [m.content]
```

### Constraints

Ensure data integrity.

```cypher
// Unique IDs
CREATE CONSTRAINT memory_id_unique IF NOT EXISTS
FOR (m:Memory) REQUIRE m.id IS UNIQUE

CREATE CONSTRAINT entity_id_unique IF NOT EXISTS
FOR (e:Entity) REQUIRE e.id IS UNIQUE

CREATE CONSTRAINT note_id_unique IF NOT EXISTS
FOR (n:Note) REQUIRE n.id IS UNIQUE

CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE

// Required properties
CREATE CONSTRAINT memory_content_exists IF NOT EXISTS
FOR (m:Memory) REQUIRE m.content IS NOT NULL

CREATE CONSTRAINT entity_name_exists IF NOT EXISTS
FOR (e:Entity) REQUIRE e.name IS NOT NULL
```

## Schema Initialization

Run at startup to ensure schema exists:

```typescript
// src/providers/graph/neo4j/schema.ts

export async function initializeSchema(
  session: Session,
  dimensions: number
): Promise<void> {
  // Vector indexes
  await session.run(
    `
    CREATE VECTOR INDEX memory_embedding IF NOT EXISTS
    FOR (m:Memory) ON (m.embedding)
    OPTIONS { indexConfig: { 
      \`vector.dimensions\`: $dimensions,
      \`vector.similarity_function\`: 'cosine'
    }}
  `,
    { dimensions }
  );

  await session.run(
    `
    CREATE VECTOR INDEX entity_embedding IF NOT EXISTS
    FOR (e:Entity) ON (e.embedding)
    OPTIONS { indexConfig: {
      \`vector.dimensions\`: $dimensions,
      \`vector.similarity_function\`: 'cosine'
    }}
  `,
    { dimensions }
  );

  // Fulltext indexes
  await session.run(`
    CREATE FULLTEXT INDEX entity_fulltext IF NOT EXISTS
    FOR (e:Entity) ON EACH [e.name, e.description]
  `);

  await session.run(`
    CREATE FULLTEXT INDEX memory_fulltext IF NOT EXISTS
    FOR (m:Memory) ON EACH [m.content]
  `);

  // Constraints
  await session.run(`
    CREATE CONSTRAINT memory_id_unique IF NOT EXISTS
    FOR (m:Memory) REQUIRE m.id IS UNIQUE
  `);

  await session.run(`
    CREATE CONSTRAINT entity_id_unique IF NOT EXISTS
    FOR (e:Entity) REQUIRE e.id IS UNIQUE
  `);

  // ... more constraints
}
```

## Query Patterns

### Vector Search

```cypher
CALL db.index.vector.queryNodes('memory_embedding', $limit, $embedding)
YIELD node, score
WHERE node.invalidAt IS NULL  // Only valid memories
RETURN node, score
ORDER BY score DESC
```

### Fulltext Search

```cypher
CALL db.index.fulltext.queryNodes('entity_fulltext', $query)
YIELD node, score
RETURN node, score
LIMIT $limit
```

### Graph Traversal

```cypher
// Get memories about an entity
MATCH (e:Entity {id: $entityId})<-[:ABOUT]-(m:Memory)
WHERE m.invalidAt IS NULL
RETURN m

// Get entity neighborhood
MATCH (e:Entity {id: $entityId})<-[:ABOUT]-(m:Memory)-[:ABOUT]->(related)
WHERE related <> e
RETURN DISTINCT related, count(m) as sharedMemories
ORDER BY sharedMemories DESC
```

### Invalidation Chain

```cypher
// Get memory with its invalidation history (2 hops)
MATCH (m:Memory {id: $memoryId})
OPTIONAL MATCH (m)-[inv:INVALIDATES*1..2]->(old:Memory)
RETURN m, collect({memory: old, reason: inv[-1].reason}) as history
```

## Validation

```bash
# Start Neo4j
docker compose up -d

# Check indexes
cypher-shell -u neo4j -p password "SHOW INDEXES"

# Check constraints
cypher-shell -u neo4j -p password "SHOW CONSTRAINTS"
```

## Checklist

- [ ] Node type defined with properties
- [ ] Edge type defined with direction and properties
- [ ] Vector index created (if node has embedding)
- [ ] Fulltext index created (if node has searchable text)
- [ ] Uniqueness constraint on ID
- [ ] Schema initialization updated
- [ ] TypeScript types defined
