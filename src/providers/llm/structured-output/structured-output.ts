/**
 * Tier 1: Structured Output Strategy
 *
 * Uses Vercel AI SDK's native structured output support via Output.object().
 * This is the most reliable strategy when the provider supports it.
 *
 * Supported by:
 * - OpenAI (GPT-4+) with json_schema response format
 * - Some OpenAI-compatible providers
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import { generateText, Output, zodSchema } from 'ai';
import type { z } from 'zod';
import type { CompletionOptions, Message } from '../types';
import type {
  StructuredOutputStrategy as IStructuredOutputStrategy,
  ProviderCapabilities
} from './types';

export class StructuredOutputStrategyImpl implements IStructuredOutputStrategy {
  readonly name = 'structured-output' as const;

  isSupported(capabilities: ProviderCapabilities): boolean {
    return capabilities.supportsStructuredOutputs;
  }

  async execute<T>(
    model: LanguageModelV3,
    messages: Message[],
    schema: z.ZodType<T>,
    options?: CompletionOptions
  ): Promise<T> {
    const { output } = await generateText({
      model,
      messages,
      output: Output.object({
        schema: zodSchema(schema)
      }),
      maxOutputTokens: options?.maxTokens,
      temperature: options?.temperature,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      providerOptions: options?.options as any
    });

    // Output.object() returns the validated object directly
    // But we still validate with our schema to ensure type safety
    return schema.parse(output);
  }
}

export const structuredOutputStrategy = new StructuredOutputStrategyImpl();
