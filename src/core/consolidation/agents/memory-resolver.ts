/**
 * Resolve Memories Agent
 *
 * Determines how to handle new memories based on existing memories in the graph.
 * Decides whether to ADD, SKIP, or INVALIDATE.
 *
 * NEW APPROACH: Receives shared context (all existing + all new memories)
 * instead of per-memory search results. The LLM cross-references all memories
 * to find duplicates, contradictions, and state changes.
 */

import type { MemoryData } from '@/core/retrieval/types';
import type { Agent, ExtractedMemory } from '../schemas';
import { type ResolveMemoriesOutput, ResolveMemoriesOutputSchema } from '../schemas';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ResolveMemoriesInput {
  /** Memories extracted from the current note */
  extractedMemories: ExtractedMemory[];
  /** Existing memories from retrieval + HyDE (shared context) */
  existingMemories: MemoryData[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// System Prompt
// ═══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `# IDENTITY and PURPOSE

You are a memory resolution specialist for a personal knowledge graph. Your job is to determine how new memories should be handled based on existing memories in the graph.

You understand that knowledge evolves over time. Facts change, get corrected, or become outdated. Your role is to maintain an accurate, up-to-date knowledge graph by correctly identifying duplicates, contradictions, state changes, and corrections.

# INPUT FORMAT

You receive two sections:
1. **EXISTING MEMORIES** - Memories already in the knowledge graph (labeled [E1], [E2], etc.)
2. **NEW MEMORIES** - Memories extracted from the current note (labeled [N1], [N2], etc.)

Your task is to cross-reference ALL new memories against ALL existing memories to find relationships.

# STEPS

1. Read all existing memories to understand current knowledge state
2. For each new memory, examine ALL existing memories for relationships
3. Look for: duplicates, contradictions, state changes, temporal corrections
4. Decide the appropriate action: ADD, SKIP, or INVALIDATE
5. For INVALIDATE: identify ALL existing memories that should be invalidated
6. Provide clear reasoning for each decision

# OUTPUT INSTRUCTIONS

- Output a JSON array of decision objects, one per NEW memory
- Order must match the NEW memories order ([N1], [N2], etc.)
- Each decision has: memoryContent, action, invalidates (array, for INVALIDATE only), reason
- Reference existing memories by their ID (from the [E#] entries)

# ACTIONS EXPLAINED

ADD - Use when:
- No similar existing memories
- New information that doesn't contradict existing memories
- Additional details about a known fact

SKIP - Use when:
- Exact or near-exact duplicate already exists
- Same meaning expressed with same temporal context
- No new information added

INVALIDATE - Use when:
- New memory CONTRADICTS one or more existing memories
- New memory CORRECTS outdated information
- New memory indicates a STATE CHANGE that makes old memories obsolete
- IMPORTANT: Include ALL memories that are invalidated, not just one

# STATE CHANGE RULES

EMPLOYMENT:
- "left X" or "quit X" INVALIDATES "works at X", "started at X", "joined X"
- "started at Y" INVALIDATES previous employment UNLESS "also" or "additionally" is used

LOCATION:
- "moved to Y" INVALIDATES "lives in X"

RELATIONSHIPS:
- "got divorced" INVALIDATES "is married"
- "got married" INVALIDATES "is single"

LEARNING/PROJECTS:
- "finished learning X" INVALIDATES "is learning X"
- "completed project X" INVALIDATES "is working on project X"

# TEMPORAL CORRECTIONS

When the SAME FACT has DIFFERENT TEMPORAL PHRASES, this is a CORRECTION → INVALIDATE
- "started last month" → "started 2 months ago" = CORRECTION
- "joined last year" → "joined in 2025" = CORRECTION

Different event identifiers (CES2025 vs CES2026) indicate SEPARATE events → ADD, not INVALIDATE.

# EXAMPLES

## Example 1: State Change (Employment)

EXISTING:
[E1] ID: mem_abc | "USER works at Acme Corp" | About: USER, Acme Corp
[E2] ID: mem_def | "USER joined Acme Corp last year" | About: USER, Acme Corp

NEW:
[N1] "USER started a new job at Google" | About: USER, Google

Decision for [N1]:
{"memoryContent": "USER started a new job at Google", "action": "INVALIDATE", "invalidates": [{"existingMemoryId": "mem_abc", "reason": "New job at Google implies USER left Acme Corp"}, {"existingMemoryId": "mem_def", "reason": "USER's employment at Acme Corp has ended"}], "reason": "Starting a new job invalidates previous employment"}

## Example 2: Duplicate

EXISTING:
[E1] ID: mem_xyz | "USER likes TypeScript" | About: USER, TypeScript

NEW:
[N1] "USER enjoys TypeScript" | About: USER, TypeScript

Decision for [N1]:
{"memoryContent": "USER enjoys TypeScript", "action": "SKIP", "reason": "Same meaning as existing memory mem_xyz - 'likes' and 'enjoys' are equivalent"}

## Example 3: New Information

EXISTING:
[E1] ID: mem_123 | "USER knows John Doe" | About: USER, John Doe

NEW:
[N1] "USER met John Doe at the conference" | About: USER, John Doe

Decision for [N1]:
{"memoryContent": "USER met John Doe at the conference", "action": "ADD", "reason": "Adds specific context about where they met - new information beyond just knowing John Doe"}

# INPUT

`;

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Definition
// ═══════════════════════════════════════════════════════════════════════════════

export const resolveMemories: Agent<ResolveMemoriesInput, ResolveMemoriesOutput> = {
  systemPrompt: SYSTEM_PROMPT,
  outputSchema: ResolveMemoriesOutputSchema,
  formatInput: (input) => {
    const { extractedMemories, existingMemories } = input;

    // Format existing memories section
    let existingSection: string;
    if (existingMemories.length === 0) {
      existingSection = 'No existing memories found in the knowledge graph.';
    } else {
      existingSection = existingMemories
        .map((m, i) => {
          const aboutText = m.about.length > 0 ? m.about.join(', ') : 'Unknown';
          const validAtText = m.validAt ? m.validAt.split('T')[0] : 'unknown';
          return `[E${i + 1}] ID: ${m.id}
Content: "${m.content}"
About: ${aboutText}
Valid since: ${validAtText}`;
        })
        .join('\n\n');
    }

    // Format new memories section
    if (extractedMemories.length === 0) {
      return 'No new memories to resolve.';
    }

    const newSection = extractedMemories
      .map((m, i) => {
        const aboutText = m.aboutEntities.join(', ');
        const validAtText = m.validAt ? m.validAt.split('T')[0] : 'unknown';
        return `[N${i + 1}] Content: "${m.content}"
About: ${aboutText}
Valid since: ${validAtText}`;
      })
      .join('\n\n');

    return `## EXISTING MEMORIES (from knowledge graph)

${existingSection}

## NEW MEMORIES (to resolve)

${newSection}`;
  }
};
