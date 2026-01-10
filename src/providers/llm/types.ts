import type { z } from 'zod';
import type { LLMProvider } from '@/config/schema';
import type { StrategyExecutorOptions } from './structured-output/types';

// Re-export tool helper from AI SDK for convenience
export { tool } from 'ai';

export type { LLMProvider };

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Options for LLM completion requests.
 * Core passes these to control model behavior.
 * If not provided, provider uses the API's defaults.
 */
export interface CompletionOptions {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Sampling temperature (0-2 for most providers) */
  temperature?: number;
  /** Provider-specific options (e.g., reasoning_effort) */
  options?: Record<string, unknown>;
}

/**
 * Options for structured JSON completion requests.
 * Extends CompletionOptions with strategy-specific options.
 */
export interface JSONCompletionOptions extends CompletionOptions {
  /** Options for the strategy executor (retry count, verbose logging, force strategy) */
  strategyOptions?: StrategyExecutorOptions;
}

/**
 * Options for tool-calling generation.
 * All parameters passed through to the AI SDK.
 * Caller is responsible for setting appropriate values.
 */
export interface GenerateWithToolsOptions extends CompletionOptions {
  /**
   * Maximum number of steps (tool call rounds).
   * Caller must specify - no default provided.
   */
  maxSteps: number;

  /** Callback fired after each step completes */
  onStepFinish?: (step: unknown) => void;
}

/**
 * Result from tool-calling generation.
 */
export interface GenerateWithToolsResult {
  /** Final text response from the model */
  text: string;
  /** All steps taken (tool calls and results) */
  steps: unknown[];
  /** Token usage (if provided by the model) */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMClient {
  /**
   * Generate a completion from the LLM.
   * @param messages - The conversation messages
   * @param options - Optional parameters (maxTokens, temperature)
   * @returns The assistant's response content as a string
   */
  complete(messages: Message[], options?: CompletionOptions): Promise<string>;

  /**
   * Generate a structured completion from the LLM.
   * Uses tiered strategy pattern with fallback:
   * 1. Native structured output (when supported)
   * 2. Tool calling
   * 3. JSON mode
   * 4. Prompt-based extraction
   *
   * @param messages - The conversation messages
   * @param schema - Zod schema for response validation
   * @param options - Optional parameters (maxTokens, temperature, strategyOptions)
   * @returns Parsed and validated response
   */
  completeJSON<T>(
    messages: Message[],
    schema: z.ZodType<T>,
    options?: JSONCompletionOptions
  ): Promise<T>;

  /**
   * Generate with tool calling support.
   * Runs an agentic loop until the model returns text or maxSteps is reached.
   * @param messages - The conversation messages
   * @param tools - Tool definitions (created with tool() helper)
   * @param options - Required options including maxSteps
   * @returns Final text, all steps, and usage stats
   */
  generateWithTools(
    messages: Message[],
    tools: Record<string, unknown>,
    options: GenerateWithToolsOptions
  ): Promise<GenerateWithToolsResult>;

  /**
   * The model identifier being used.
   */
  readonly modelId: string;
}
