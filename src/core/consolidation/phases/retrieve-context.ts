/**
 * Retrieve Context Phase
 *
 * Branch A of the consolidation pipeline.
 * Retrieves existing memories relevant to the note using:
 * 1. Full retrieval pipeline (LAND → ANCHOR → EXPAND → DISTILL → TRACE)
 * 2. HyDE augmentation for better coverage
 *
 * Input: Note content
 * Output: Top K existing memories for resolution
 */

import { retrieve as retrievePipeline } from '@/core/retrieval/pipeline';
import type { MemoryData, RetrievalOutput } from '@/core/retrieval/types';
import type { EmbeddingClient } from '@/providers/embedding/types';
import type { GraphClient, Memory } from '@/providers/graph/types';
import type { LLMClient } from '@/providers/llm/types';
import { hydeGenerator } from '../agents/hyde-generator';
import type { LLMConfig, PipelineStats } from '../types';
import { callAgent } from '../utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface RetrieveContextInput {
  noteContent: string;
}

export interface RetrieveContextDependencies {
  graphClient: GraphClient;
  embeddingClient: EmbeddingClient;
  llmClient: LLMClient;
}

export interface RetrieveContextConfig {
  /** Maximum memories to return (default: 15) */
  topK: number;
  /** Temperature for HyDE generation (default: 0.7) */
  hydeTemperature: number;
  /** Results per HyDE document vector search (default: 10) */
  hydeResultsPerDoc: number;
}

export interface RetrieveContextOutput {
  /** Top K existing memories for resolution */
  memories: MemoryData[];
  /** Retrieval metadata */
  meta: {
    retrievalCount: number;
    hydeCount: number;
    hydeOnlyCount: number;
    totalCandidates: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Implementation
// ═══════════════════════════════════════════════════════════════════════════════

export async function retrieveContext(
  input: RetrieveContextInput,
  deps: RetrieveContextDependencies,
  config: RetrieveContextConfig,
  llmConfig: LLMConfig,
  stats: PipelineStats
): Promise<RetrieveContextOutput> {
  const { noteContent } = input;
  const { graphClient, embeddingClient, llmClient } = deps;

  // Step 1: Embed note content
  const noteEmbedding = await embeddingClient.embed(noteContent);

  // Step 2: Call retrieval pipeline
  const retrievalResult = (await retrievePipeline(
    { query: noteContent, queryEmbedding: noteEmbedding },
    { graphClient, embeddingClient, llmClient }
  )) as RetrievalOutput;

  // Early exit if no memories found (skip HyDE - no context to generate from)
  if (retrievalResult.memories.length === 0) {
    return {
      memories: [],
      meta: { retrievalCount: 0, hydeCount: 0, hydeOnlyCount: 0, totalCandidates: 0 }
    };
  }

  // Step 3: Generate HyDE documents
  const hydeOutput = await callAgent(
    hydeGenerator,
    { memories: retrievalResult.memories },
    llmClient,
    llmConfig,
    stats,
    { temperature: config.hydeTemperature }
  );

  // Step 4: Embed HyDE documents
  const hydeDocs = [
    ...hydeOutput.semantic.map((d) => d.content),
    ...hydeOutput.stateChange.map((d) => d.content)
  ];

  // Skip HyDE search if no documents generated
  if (hydeDocs.length === 0) {
    return {
      memories: retrievalResult.memories.slice(0, config.topK),
      meta: {
        retrievalCount: retrievalResult.memories.length,
        hydeCount: 0,
        hydeOnlyCount: 0,
        totalCandidates: retrievalResult.memories.length
      }
    };
  }

  const hydeEmbeddings = await embeddingClient.embedBatch(hydeDocs);

  // Step 5: Parallel vector searches with HyDE embeddings
  const hydeSearchPromises = hydeEmbeddings.map((embedding) =>
    graphClient.searchVector('Memory', embedding, config.hydeResultsPerDoc, {
      validOnly: true
    })
  );
  const hydeSearchResults = await Promise.all(hydeSearchPromises);

  // Step 6: Collect HyDE results, dedupe by ID keeping highest score
  // Store raw Memory data for HyDE-only results
  const hydeById = new Map<string, { memory: Memory; score: number }>();

  for (const results of hydeSearchResults) {
    for (const result of results) {
      const memory = result.node as Memory;
      const existing = hydeById.get(memory.id);
      if (!existing || result.score > existing.score) {
        hydeById.set(memory.id, { memory, score: result.score });
      }
    }
  }

  // Step 7: Merge retrieval + HyDE results
  const retrievalIds = new Set(retrievalResult.memories.map((m) => m.id));
  const mergedById = new Map<string, MemoryData>();

  // Add retrieval results (they have full MemoryData)
  for (const memory of retrievalResult.memories) {
    const hydeResult = hydeById.get(memory.id);
    if (hydeResult) {
      // Both found it - take max score
      const boostedScore = Math.max(memory.score, hydeResult.score);
      mergedById.set(memory.id, { ...memory, score: boostedScore });
    } else {
      mergedById.set(memory.id, memory);
    }
  }

  // Step 8: Identify HyDE-only results (not in retrieval)
  const hydeOnlyIds: string[] = [];
  const hydeOnlyData = new Map<string, { memory: Memory; score: number }>();

  for (const [id, data] of hydeById) {
    if (!retrievalIds.has(id)) {
      hydeOnlyIds.push(id);
      hydeOnlyData.set(id, data);
    }
  }

  // Step 9: Batch fetch `about` relationships for HyDE-only memories
  if (hydeOnlyIds.length > 0) {
    const aboutMap = await graphClient.getMemoryAboutEntities(hydeOnlyIds);

    // Convert HyDE-only results to MemoryData
    for (const id of hydeOnlyIds) {
      const data = hydeOnlyData.get(id);
      if (!data) continue;

      const aboutEntities = aboutMap.get(id) ?? [];

      const memoryData: MemoryData = {
        rank: 0, // Will be set after sorting
        id: data.memory.id,
        content: data.memory.content,
        score: data.score,
        source: 'vector',
        about: aboutEntities,
        aboutEntityIds: [], // Not needed for resolve-memories
        validAt: data.memory.valid_at ?? null
      };

      mergedById.set(id, memoryData);
    }
  }

  // Step 10: Sort by score, assign ranks, take top K
  const sortedMemories = Array.from(mergedById.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, config.topK)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  return {
    memories: sortedMemories,
    meta: {
      retrievalCount: retrievalResult.memories.length,
      hydeCount: hydeById.size,
      hydeOnlyCount: hydeOnlyIds.length,
      totalCandidates: mergedById.size
    }
  };
}
