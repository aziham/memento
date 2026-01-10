/**
 * Strategy Types for Structured Output Generation
 *
 * Defines interfaces for the tiered strategy pattern used to generate
 * structured JSON output from LLMs across different providers.
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { z } from 'zod';
import type { CompletionOptions, Message } from '../types';

/**
 * Strategy names for structured output generation.
 * Listed in order of preference (most reliable first).
 */
export type StrategyName = 'structured-output' | 'tool-calling' | 'json-mode' | 'prompt-based';

/**
 * Provider capabilities for structured output.
 * Detected at factory level based on provider type.
 */
export interface ProviderCapabilities {
  /** Provider supports native structured outputs (e.g., OpenAI json_schema) */
  supportsStructuredOutputs: boolean;
  /** Provider supports tool/function calling */
  supportsToolCalling: boolean;
  /** Provider supports JSON mode (response_format: json_object) */
  supportsJsonMode: boolean;
  /** The provider identifier */
  provider: string;
}

/**
 * Result from a strategy execution attempt.
 */
export interface StrategyResult<T> {
  /** The parsed and validated result */
  data: T;
  /** Which strategy succeeded */
  strategy: StrategyName;
  /** Raw text output (for debugging) */
  rawText?: string;
}

/**
 * Error from a strategy execution attempt.
 */
export interface StrategyError {
  /** Which strategy failed */
  strategy: StrategyName;
  /** The error that occurred */
  error: Error;
  /** Raw text output if available (for debugging) */
  rawText?: string;
}

/**
 * Interface for a structured output strategy.
 * Each strategy implements a different approach to getting JSON from the LLM.
 */
export interface StructuredOutputStrategy {
  /** Unique name for this strategy */
  readonly name: StrategyName;

  /**
   * Check if this strategy is supported for the given capabilities.
   * @param capabilities - Provider capabilities detected at factory level
   * @returns true if this strategy can be used
   */
  isSupported(capabilities: ProviderCapabilities): boolean;

  /**
   * Execute the strategy to generate structured output.
   * @param model - The language model to use
   * @param messages - The conversation messages
   * @param schema - Zod schema for validation
   * @param options - Optional completion options
   * @returns The parsed and validated result
   * @throws Error if generation or validation fails
   */
  execute<T>(
    model: LanguageModelV3,
    messages: Message[],
    schema: z.ZodType<T>,
    options?: CompletionOptions
  ): Promise<T>;
}

/**
 * Options for the strategy executor.
 */
export interface StrategyExecutorOptions {
  /** Maximum retries per strategy before falling back (default: 2) */
  maxRetriesPerStrategy?: number;
  /** Whether to log strategy selection and fallback (default: false) */
  verbose?: boolean;
  /** Force a specific strategy (for testing/debugging) */
  forceStrategy?: StrategyName;
}

/**
 * Convert a Zod schema to a JSON schema for prompts.
 * This is a simplified version - the actual implementation will use zod-to-json-schema.
 */
export function zodSchemaToJsonDescription<T>(schema: z.ZodType<T>): string {
  // Use Zod's built-in description if available, otherwise generate from shape
  try {
    // @ts-expect-error - accessing internal Zod properties
    const shape = schema._def?.shape?.();
    if (shape) {
      const fields = Object.entries(shape).map(([key, value]) => {
        // @ts-expect-error - accessing internal Zod properties
        const typeName = value?._def?.typeName || 'unknown';
        // @ts-expect-error - accessing internal Zod properties
        const description = value?._def?.description || '';
        return `  "${key}": ${typeName}${description ? ` // ${description}` : ''}`;
      });
      return `{\n${fields.join(',\n')}\n}`;
    }
  } catch {
    // Fall back to generic description
  }
  return 'a JSON object matching the expected schema';
}
