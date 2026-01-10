/**
 * Tier 3: JSON Mode Strategy
 *
 * Uses JSON mode (response_format: json_object) to ensure valid JSON output.
 * The schema is included in the prompt to guide the model.
 *
 * Supported by:
 * - OpenAI (all models)
 * - Google (Gemini)
 * - Some OpenAI-compatible providers
 *
 * Note: JSON mode ensures valid JSON but doesn't enforce schema.
 * We validate the output with Zod after parsing.
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import { generateText, Output } from 'ai';
import type { z } from 'zod';
import type { CompletionOptions, Message } from '../types';
import type { ProviderCapabilities, StructuredOutputStrategy } from './types';
import { zodSchemaToJsonDescription } from './types';

export class JsonModeStrategyImpl implements StructuredOutputStrategy {
  readonly name = 'json-mode' as const;

  isSupported(capabilities: ProviderCapabilities): boolean {
    return capabilities.supportsJsonMode;
  }

  async execute<T>(
    model: LanguageModelV3,
    messages: Message[],
    schema: z.ZodType<T>,
    options?: CompletionOptions
  ): Promise<T> {
    if (messages.length === 0) {
      throw new Error('JSON mode strategy: No messages provided');
    }

    // Add schema description to the last message
    const schemaDescription = zodSchemaToJsonDescription(schema);
    const lastMessage = messages[messages.length - 1]!;
    const enhancedMessages: Message[] = [
      ...messages.slice(0, -1),
      {
        role: lastMessage.role,
        content:
          lastMessage.content +
          `\n\nRespond with a JSON object matching this structure:\n${schemaDescription}`
      }
    ];

    const { output } = await generateText({
      model,
      messages: enhancedMessages,
      output: Output.json(),
      maxOutputTokens: options?.maxTokens,
      temperature: options?.temperature,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      providerOptions: options?.options as any
    });

    // Output.json() returns parsed JSON, but we need to validate against our schema
    return schema.parse(output);
  }
}

export const jsonModeStrategy = new JsonModeStrategyImpl();
