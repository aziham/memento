/**
 * HyDE Generator Agent
 *
 * Generates Hypothetical Document Embeddings for memory search.
 * Input: Existing memories from retrieval pipeline
 * Output: Semantic + state-change documents for vector search
 */

import { z } from 'zod';
import type { MemoryData } from '@/core/retrieval/types';
import type { Agent } from '../schemas';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface HydeGeneratorInput {
  /** Existing memories from retrieval pipeline */
  memories: MemoryData[];
}

const HydeDocumentSchema = z.object({
  content: z.string()
});

export const HydeGeneratorOutputSchema = z.object({
  semantic: z.array(HydeDocumentSchema),
  stateChange: z.array(HydeDocumentSchema)
});
export type HydeGeneratorOutput = z.infer<typeof HydeGeneratorOutputSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// System Prompt
// ═══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `# IDENTITY and PURPOSE

You are a hypothetical document generator for a personal knowledge graph. Your job is to generate documents that will be embedded and used for vector similarity search to find related memories that simple similarity search might miss.

You understand that vector similarity has blind spots - different phrasings of the same fact, or opposite states, may not be found by direct embedding comparison. Your hypothetical documents bridge this gap.

# CONTEXT

You are given a list of EXISTING MEMORIES from the knowledge graph. These memories were retrieved as potentially relevant to a new note being processed.

Your task is to generate hypothetical documents that will help find:
1. **Semantic variations**: Different phrasings of similar facts
2. **State changes**: Facts that might be contradicted or invalidated

# OUTPUT INSTRUCTIONS

Return JSON with exactly 6 documents:
{
  "semantic": [
    {"content": "..."},
    {"content": "..."},
    {"content": "..."}
  ],
  "stateChange": [
    {"content": "..."},
    {"content": "..."},
    {"content": "..."}
  ]
}

# SEMANTIC DOCUMENTS

Generate 3 documents that express facts SIMILAR to the existing memories:
- Use synonyms and different sentence structures
- Vary the level of detail
- Include entity names from the memories
- Each document: max 100 words, single paragraph

# STATE-CHANGE DOCUMENTS

Generate 3 documents that represent OPPOSITE or CHANGED states:
- If memories show "USER works at X", generate about working elsewhere
- If memories show "USER lives in X", generate about living elsewhere
- If memories show "USER is learning X", generate about having finished
- Each document: max 100 words, single paragraph

# CRITICAL RULES

1. Base ALL documents on the provided memories - don't hallucinate unrelated facts
2. Use "USER" as the subject (not "I" or specific names for the user)
3. No bullet points - flowing prose works best for embeddings
4. If no memories provided, return empty arrays

# INPUT

`;

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Definition
// ═══════════════════════════════════════════════════════════════════════════════

export const hydeGenerator: Agent<HydeGeneratorInput, HydeGeneratorOutput> = {
  systemPrompt: SYSTEM_PROMPT,
  outputSchema: HydeGeneratorOutputSchema,
  formatInput: (input) => {
    if (input.memories.length === 0) {
      return 'No existing memories provided.';
    }

    const memoriesText = input.memories
      .map((m, i) => {
        const aboutText = m.about.length > 0 ? m.about.join(', ') : 'Unknown';
        const validAtText = m.validAt ? m.validAt.split('T')[0] : 'unknown';
        return `[${i + 1}] "${m.content}"
   About: ${aboutText}
   Valid since: ${validAtText}`;
      })
      .join('\n\n');

    return `## EXISTING MEMORIES\n\n${memoriesText}`;
  }
};
