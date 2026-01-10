/**
 * Vercel AI SDK v6 LLM Client
 *
 * Wraps the AI SDK generateText function for internal Core use.
 * Implements tiered fallback for structured JSON output:
 * 1. Native structured output (Output.object) - when provider supports it
 * 2. Tool calling with forced tool choice - widely supported
 * 3. JSON mode (Output.json) - ensures valid JSON
 * 4. Prompt-based with markdown extraction - universal fallback
 *
 * No streaming - extraction tasks need complete responses for parsing.
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import { generateText, stepCountIs } from 'ai';
import type { z } from 'zod';
import {
  executeWithStrategies,
  getDefaultCapabilities,
  type ProviderCapabilities
} from './structured-output';
import type {
  CompletionOptions,
  GenerateWithToolsOptions,
  GenerateWithToolsResult,
  JSONCompletionOptions,
  LLMClient,
  Message
} from './types';

export class VercelLLMClient implements LLMClient {
  readonly modelId: string;
  private readonly capabilities: ProviderCapabilities;

  constructor(
    private model: LanguageModelV3,
    capabilities?: ProviderCapabilities
  ) {
    this.modelId = model.modelId;
    // Use provided capabilities or detect from model
    this.capabilities = capabilities ?? getDefaultCapabilities('openai-compatible');
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<string> {
    const providerOpts = options?.options
      ? { [this.capabilities.provider]: options.options }
      : undefined;

    const { text } = await generateText({
      model: this.model,
      messages,
      maxOutputTokens: options?.maxTokens,
      temperature: options?.temperature,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      providerOptions: providerOpts as any
    });

    return text;
  }

  /**
   * Generate structured JSON output with tiered fallback strategy.
   *
   * Tries strategies in order based on provider capabilities:
   * - OpenAI: structured output → tool calling → JSON mode → prompt-based
   * - Anthropic: tool calling → prompt-based
   * - Google: JSON mode → tool calling → prompt-based
   * - Others: tries all strategies in order
   *
   * Each strategy retries with error feedback before falling back.
   */
  async completeJSON<T>(
    messages: Message[],
    schema: z.ZodType<T>,
    options?: JSONCompletionOptions
  ): Promise<T> {
    const { strategyOptions, ...completionOptions } = options ?? {};

    return executeWithStrategies(
      this.model,
      messages,
      schema,
      this.capabilities,
      completionOptions,
      strategyOptions
    );
  }

  async generateWithTools(
    messages: Message[],
    tools: Record<string, unknown>,
    options: GenerateWithToolsOptions
  ): Promise<GenerateWithToolsResult> {
    const { text, steps, usage } = await generateText({
      model: this.model,
      messages,
      tools: tools as Parameters<typeof generateText>[0]['tools'],
      stopWhen: stepCountIs(options.maxSteps),
      maxOutputTokens: options?.maxTokens,
      temperature: options?.temperature,
      onStepFinish: options.onStepFinish
    });

    return {
      text,
      steps,
      usage:
        usage.inputTokens !== undefined && usage.outputTokens !== undefined
          ? {
              promptTokens: usage.inputTokens,
              completionTokens: usage.outputTokens,
              totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
            }
          : undefined
    };
  }

  /**
   * Get the current provider capabilities.
   * Useful for debugging and testing.
   */
  getCapabilities(): ProviderCapabilities {
    return { ...this.capabilities };
  }
}
