/**
 * Consolidation Utilities
 */

import type { LLMClient, Message } from '@/providers/llm/types';
import type { Agent } from './schemas';
import type { LLMConfig, PipelineStats } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Execution
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Call an agent with retry logic.
 *
 * @param agent - The agent definition (prompt + schema + formatInput)
 * @param input - Input to the agent
 * @param llmClient - LLM client for completion
 * @param config - LLM configuration (retries, temperature, etc.)
 * @param stats - Pipeline stats to update
 * @param overrides - Optional config overrides (e.g., temperature for HyDE)
 * @returns The validated output from the agent
 */
export async function callAgent<I, O>(
  agent: Agent<I, O>,
  input: I,
  llmClient: LLMClient,
  config: LLMConfig,
  stats: PipelineStats,
  overrides?: Partial<LLMConfig>
): Promise<O> {
  const effectiveConfig = overrides ? { ...config, ...overrides } : config;

  const messages: Message[] = [
    { role: 'system', content: agent.systemPrompt },
    { role: 'user', content: agent.formatInput(input) }
  ];

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= effectiveConfig.maxRetries; attempt++) {
    stats.totalLLMCalls++;
    if (attempt > 0) stats.totalRetries++;

    try {
      return await llmClient.completeJSON(messages, agent.outputSchema, {
        maxTokens: effectiveConfig.maxTokens,
        temperature: effectiveConfig.temperature,
        options: effectiveConfig.options
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(
    `Agent failed after ${effectiveConfig.maxRetries + 1} attempts: ${lastError?.message}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Assertions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Assert that a value is defined (not null or undefined).
 * Throws an error with a descriptive message if the value is nullish.
 *
 * @param value - The value to check
 * @param message - Optional error message
 * @returns The value, with null/undefined narrowed out of the type
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): T {
  if (value == null) {
    throw new Error(message ?? 'Expected value to be defined');
  }
  return value;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Entity Name Normalization
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize an entity name to Title Case.
 *
 * Examples:
 *   "machine learning" -> "Machine Learning"
 *   "neo4j" -> "Neo4j"
 *   "GPT-4" -> "GPT-4" (preserves all-uppercase acronyms)
 *   "TypeScript" -> "TypeScript" (preserves existing mixed case)
 *   "AWS" -> "AWS" (preserves acronyms of any length)
 *   "NASA" -> "NASA" (preserves acronyms of any length)
 *
 * Rules:
 * - If a word is ALL UPPERCASE (with optional numbers), preserve it as an acronym
 * - If a word has mixed case (upper + lower), preserve it as-is
 * - If a word is all lowercase, apply Title Case
 * - Preserves hyphens, spaces, and other separators
 */
export function normalizeEntityName(name: string): string {
  return name
    .split(/(\s+|-+)/) // Split on spaces and hyphens, keeping separators
    .map((part) => {
      // Keep separators as-is
      if (/^[\s-]+$/.test(part)) return part;

      // If all uppercase (with optional numbers), preserve as acronym
      // e.g., "AI", "AWS", "HTTP", "NASA", "GPT4", "H2O"
      if (/^[A-Z0-9]+$/.test(part)) return part;

      // If already has mixed case (uppercase + lowercase), preserve it
      // e.g., "TypeScript", "JavaScript", "Neo4j", "iPhone"
      if (/[A-Z]/.test(part) && /[a-z]/.test(part)) return part;

      // Otherwise (all lowercase), apply title case
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}
