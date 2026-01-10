/**
 * Strategy Registry and Executor
 *
 * Manages the tiered strategy pattern for structured output generation.
 * Handles strategy selection based on provider capabilities and
 * implements retry logic with error feedback.
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { z } from 'zod';
import type { CompletionOptions, Message } from '../types';
import { jsonModeStrategy } from './json-mode';
import { promptBasedStrategy } from './prompt-based';
import { structuredOutputStrategy } from './structured-output';
import { toolCallingStrategy } from './tool-calling';
import type {
  ProviderCapabilities,
  StrategyError,
  StrategyExecutorOptions,
  StrategyName,
  StructuredOutputStrategy
} from './types';

/**
 * All available strategies in order of preference.
 */
const ALL_STRATEGIES: StructuredOutputStrategy[] = [
  structuredOutputStrategy,
  toolCallingStrategy,
  jsonModeStrategy,
  promptBasedStrategy
];

/**
 * Get strategies for a specific provider based on its capabilities.
 * Returns strategies in order of preference for that provider.
 */
export function getStrategiesForProvider(
  capabilities: ProviderCapabilities
): StructuredOutputStrategy[] {
  const { provider } = capabilities;

  // Provider-specific strategy ordering
  switch (provider) {
    case 'openai':
      // OpenAI: Prefer structured outputs, then tool calling, then JSON mode
      return [
        structuredOutputStrategy,
        toolCallingStrategy,
        jsonModeStrategy,
        promptBasedStrategy
      ].filter((s) => s.isSupported(capabilities));

    case 'anthropic':
      // Anthropic: Tool calling is the primary approach (no native structured output)
      return [toolCallingStrategy, promptBasedStrategy].filter((s) => s.isSupported(capabilities));

    case 'google':
      // Google: JSON mode with response_schema, then tool calling
      return [jsonModeStrategy, toolCallingStrategy, promptBasedStrategy].filter((s) =>
        s.isSupported(capabilities)
      );

    case 'ollama':
    case 'openai-compatible':
      // Unknown capabilities - try all strategies in order
      return ALL_STRATEGIES.filter((s) => s.isSupported(capabilities));

    default:
      // Default: try all strategies
      return ALL_STRATEGIES.filter((s) => s.isSupported(capabilities));
  }
}

/**
 * Execute structured output generation with tiered fallback and retry logic.
 *
 * Strategy:
 * 1. Select strategies based on provider capabilities
 * 2. Try each strategy in order
 * 3. For each strategy, retry with error feedback on validation failures
 * 4. Fall back to next strategy if all retries fail
 * 5. Throw aggregated error if all strategies fail
 */
export async function executeWithStrategies<T>(
  model: LanguageModelV3,
  messages: Message[],
  schema: z.ZodType<T>,
  capabilities: ProviderCapabilities,
  options?: CompletionOptions,
  executorOptions?: StrategyExecutorOptions
): Promise<T> {
  const { maxRetriesPerStrategy = 2, verbose = false, forceStrategy } = executorOptions ?? {};

  // Get strategies for this provider
  let strategies = getStrategiesForProvider(capabilities);

  // If forcing a specific strategy, use only that one
  if (forceStrategy) {
    const forced = strategies.find((s) => s.name === forceStrategy);
    if (!forced) {
      throw new Error(
        `Forced strategy "${forceStrategy}" is not supported for provider "${capabilities.provider}"`
      );
    }
    strategies = [forced];
  }

  if (strategies.length === 0) {
    throw new Error(`No strategies available for provider "${capabilities.provider}"`);
  }

  const errors: StrategyError[] = [];

  for (const strategy of strategies) {
    if (verbose) {
      console.log(`[LLM] Trying strategy: ${strategy.name}`);
    }

    let currentMessages = [...messages];
    let lastError: Error | null = null;

    // Retry loop for this strategy
    for (let attempt = 0; attempt <= maxRetriesPerStrategy; attempt++) {
      try {
        const result = await strategy.execute(model, currentMessages, schema, options);

        if (verbose) {
          console.log(`[LLM] Strategy "${strategy.name}" succeeded on attempt ${attempt + 1}`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        if (verbose) {
          console.log(
            `[LLM] Strategy "${strategy.name}" failed on attempt ${attempt + 1}: ${lastError.message}`
          );
        }

        // Check if this is a validation error (Zod) - worth retrying with feedback
        const isValidationError =
          lastError.name === 'ZodError' ||
          lastError.message.includes('validation') ||
          lastError.message.includes('parse');

        // Don't retry if we've exhausted retries or it's not a validation error
        if (attempt >= maxRetriesPerStrategy || !isValidationError) {
          break;
        }

        // Add error feedback for next attempt
        const errorContext =
          `The previous response was invalid. ` +
          `Error: ${lastError.message}. ` +
          `Please try again with a valid response matching the expected format.`;

        currentMessages = [...messages, { role: 'user' as const, content: errorContext }];
      }
    }

    // Record the error for this strategy
    if (lastError) {
      errors.push({
        strategy: strategy.name,
        error: lastError
      });
    }
  }

  // All strategies failed - throw aggregated error
  const errorSummary = errors.map((e) => `${e.strategy}: ${e.error.message}`).join('\n');

  throw new Error(
    `All structured output strategies failed for provider "${capabilities.provider}".\n` +
      `Tried strategies: ${strategies.map((s) => s.name).join(', ')}\n` +
      `Errors:\n${errorSummary}`
  );
}

/**
 * Get the default capabilities for a provider.
 * Used when capabilities are not explicitly provided.
 */
export function getDefaultCapabilities(provider: string): ProviderCapabilities {
  switch (provider) {
    case 'openai':
      return {
        provider,
        supportsStructuredOutputs: true,
        supportsToolCalling: true,
        supportsJsonMode: true
      };

    case 'anthropic':
      return {
        provider,
        supportsStructuredOutputs: false,
        supportsToolCalling: true,
        supportsJsonMode: false
      };

    case 'google':
      return {
        provider,
        supportsStructuredOutputs: false,
        supportsToolCalling: true,
        supportsJsonMode: true
      };

    case 'ollama':
      // Ollama capabilities vary by model - be conservative
      return {
        provider,
        supportsStructuredOutputs: false,
        supportsToolCalling: false,
        supportsJsonMode: true
      };

    case 'openai-compatible':
      // OpenAI-compatible providers may support various features
      // Default to trying structured outputs (can be overridden)
      return {
        provider,
        supportsStructuredOutputs: true,
        supportsToolCalling: true,
        supportsJsonMode: true
      };

    default:
      // Unknown provider - use most conservative settings
      return {
        provider,
        supportsStructuredOutputs: false,
        supportsToolCalling: false,
        supportsJsonMode: false
      };
  }
}

// Re-export types and strategies
export type {
  ProviderCapabilities,
  StrategyError,
  StrategyExecutorOptions,
  StrategyName,
  StructuredOutputStrategy
};
export { jsonModeStrategy, promptBasedStrategy, structuredOutputStrategy, toolCallingStrategy };
