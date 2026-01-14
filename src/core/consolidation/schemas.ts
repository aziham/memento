import { z } from 'zod';
import type { EmbeddingClient } from '@/providers/embedding/types';
import { ENTITY_TYPES, type GraphClient } from '@/providers/graph/types';
import type { LLMClient } from '@/providers/llm/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Core Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Zod schema for EntityType validation.
 * Matches the ENTITY_TYPES constant from graph provider.
 */
export const EntityTypeSchema = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityTypeSchema>;

/**
 * Dependencies for the consolidation pipeline.
 * These are injected by the caller (created externally).
 */
export interface ConsolidationDependencies {
  graphClient: GraphClient;
  embeddingClient: EmbeddingClient;
  llmClient: LLMClient;
}

/**
 * Agent definition for LLM-powered extraction and resolution.
 *
 * @template I - Input type for formatInput
 * @template O - Output type validated by outputSchema
 *
 * The systemPrompt defines the agent's identity, steps, output format, and examples.
 * The formatInput function transforms structured input into the {{input}} placeholder content.
 */
export interface Agent<I, O> {
  /** System prompt with IDENTITY, STEPS, OUTPUT, EXAMPLES sections */
  systemPrompt: string;
  /** Zod schema for validating and parsing LLM output */
  outputSchema: z.ZodType<O>;
  /** Transforms structured input into the user message content */
  formatInput: (input: I) => string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Input/Output Schemas
// ═══════════════════════════════════════════════════════════════════════════════

// Input/Output
export const ConsolidationInputSchema = z.object({
  content: z.string().min(1),
  timestamp: z.iso.datetime()
});
export type ConsolidationInput = z.infer<typeof ConsolidationInputSchema>;

export const EntityDecisionSchema = z.object({
  action: z.enum(['CREATE', 'MATCH']),
  name: z.string(),
  type: EntityTypeSchema,
  description: z.string(),
  matchedEntityId: z.string().optional(),
  similarity: z.number().optional(),
  /** Pre-computed embedding for CREATE entities (required for CREATE, undefined for MATCH) */
  embedding: z.array(z.number()).optional(),
  /** Whether to update the existing entity's description (only for MATCH) */
  updateDescription: z.boolean().optional(),
  /** Whether LLMs already know about this entity (only for CREATE, immutable once set) */
  isWellKnown: z.boolean().optional(),
  reason: z.string()
});
export type EntityDecision = z.infer<typeof EntityDecisionSchema>;

export const ExtractedMemorySchema = z.object({
  content: z.string(),
  aboutEntities: z.array(z.string()),
  validAt: z.string().nullable()
});
export type ExtractedMemory = z.infer<typeof ExtractedMemorySchema>;

/** Schema for a single invalidation target with its specific reason */
export const InvalidationTargetSchema = z.object({
  existingMemoryId: z.string(),
  reason: z.string()
});
export type InvalidationTarget = z.infer<typeof InvalidationTargetSchema>;

export const MemoryDecisionSchema = z.object({
  action: z.enum(['ADD', 'SKIP', 'INVALIDATE']),
  content: z.string(),
  aboutEntities: z.array(z.string()),
  validAt: z.iso.datetime().optional(),
  /** Pre-computed embedding for ADD/INVALIDATE memories (required for ADD/INVALIDATE, undefined for SKIP) */
  embedding: z.array(z.number()).optional(),
  /** Array of memories to invalidate, each with its own reason (only for INVALIDATE action) */
  invalidates: z.array(InvalidationTargetSchema).optional(),
  reason: z.string()
});
export type MemoryDecision = z.infer<typeof MemoryDecisionSchema>;

export interface ConsolidationResult {
  entities: EntityDecision[];
  memories: MemoryDecision[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Output Schemas
// ═══════════════════════════════════════════════════════════════════════════════

// Agent output schemas

/** Schema for extracted entity with name, type, description, and isWellKnown classification */
export const ExtractedEntitySchema = z.object({
  name: z.string(),
  type: EntityTypeSchema,
  description: z.string(),
  isWellKnown: z.boolean()
});
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

/**
 * Extract entities output - includes entities and optional user biographical facts.
 * userBiographicalFacts captures factual info about the user (profession, location, etc.)
 * that should be merged into the User node's description.
 */
export const ExtractEntitiesOutputSchema = z.object({
  entities: z.array(ExtractedEntitySchema),
  /** Biographical facts about the user (profession, company, location, expertise) - null if none found */
  userBiographicalFacts: z.string().nullable()
});
export type ExtractEntitiesOutput = z.infer<typeof ExtractEntitiesOutputSchema>;

export const ExtractMemoriesOutputSchema = z.array(ExtractedMemorySchema);
export type ExtractMemoriesOutput = z.infer<typeof ExtractMemoriesOutputSchema>;

/** Schema for entity resolution decision */
export const ResolvedEntitySchema = z.object({
  entityName: z.string(),
  entityType: EntityTypeSchema,
  action: z.enum(['CREATE', 'MATCH']),
  matchedEntityId: z.string().optional(),
  /** Whether to update the existing entity's description with the new one (only for MATCH) */
  updateDescription: z.boolean().optional(),
  reason: z.string()
});
export type ResolvedEntity = z.infer<typeof ResolvedEntitySchema>;

/** Schema for user description update decision */
export const UserDescriptionUpdateSchema = z.object({
  /** The new merged description combining existing + new biographical facts */
  newDescription: z.string(),
  /** Whether the description should be updated (true if new info adds value) */
  shouldUpdate: z.boolean(),
  /** Explanation of what changed or why no update is needed */
  reason: z.string()
});
export type UserDescriptionUpdate = z.infer<typeof UserDescriptionUpdateSchema>;

/**
 * Resolve entities output - includes entity decisions and optional user description update.
 * userDescriptionUpdate is present when biographical facts were extracted and compared
 * with the existing User description.
 */
export const ResolveEntitiesOutputSchema = z.object({
  entities: z.array(ResolvedEntitySchema),
  /** User description update decision - null if no biographical facts to process */
  userDescriptionUpdate: UserDescriptionUpdateSchema.nullable()
});
export type ResolveEntitiesOutput = z.infer<typeof ResolveEntitiesOutputSchema>;

export const ResolveMemoriesOutputSchema = z.array(
  z.object({
    memoryContent: z.string(),
    action: z.enum(['ADD', 'SKIP', 'INVALIDATE']),
    /** Array of memories to invalidate, each with its own specific reason (only for INVALIDATE action) */
    invalidates: z
      .array(
        z.object({
          existingMemoryId: z.string(),
          reason: z.string()
        })
      )
      .optional(),
    reason: z.string()
  })
);
export type ResolveMemoriesOutput = z.infer<typeof ResolveMemoriesOutputSchema>;
