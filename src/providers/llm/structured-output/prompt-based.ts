/**
 * Tier 4: Prompt-based Strategy
 *
 * Universal fallback that works with any model.
 * Includes the schema in the prompt and extracts JSON from the response.
 *
 * This strategy:
 * 1. Adds schema description to the prompt
 * 2. Generates plain text response
 * 3. Extracts JSON from markdown code blocks or raw text
 * 4. Validates against the schema
 *
 * Supported by: All models (universal fallback)
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import { generateText } from 'ai';
import type { z } from 'zod';
import type { CompletionOptions, Message } from '../types';
import type { ProviderCapabilities, StructuredOutputStrategy } from './types';
import { zodSchemaToJsonDescription } from './types';

/**
 * Extract JSON from text that may be wrapped in markdown code blocks.
 * Handles various formats:
 * - ```json ... ```
 * - ``` ... ```
 * - Raw JSON object/array
 * - JSON embedded in text
 */
export function extractJSON(text: string): string {
  // Try to extract from markdown code blocks (with or without language tag)
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch?.[1]) {
    return mdMatch[1].trim();
  }

  // Try to find JSON object directly (handles nested objects)
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    // Validate it's actually JSON by trying to find matching braces
    const jsonStr = objectMatch[0];
    let depth = 0;
    let endIndex = -1;

    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === '{') depth++;
      else if (jsonStr[i] === '}') {
        depth--;
        if (depth === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }

    if (endIndex > 0) {
      return jsonStr.substring(0, endIndex).trim();
    }
  }

  // Try to find JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) {
    return arrayMatch[0].trim();
  }

  return text.trim();
}

/**
 * Attempt to salvage truncated JSON.
 * Tries to find the last valid closing bracket.
 */
export function salvageJSON(text: string): string | null {
  if (!text) return null;

  // Try to salvage a JSON array
  const arrayMatch = text.match(/\]\s*$/);
  if (arrayMatch) {
    try {
      JSON.parse(text.substring(0, arrayMatch.index! + 1));
      return text.substring(0, arrayMatch.index! + 1);
    } catch {
      // Not valid JSON
    }
  }

  // Try to salvage a JSON object
  const objMatch = text.match(/\}\s*$/);
  if (objMatch) {
    try {
      JSON.parse(text.substring(0, objMatch.index! + 1));
      return text.substring(0, objMatch.index! + 1);
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

export class PromptBasedStrategyImpl implements StructuredOutputStrategy {
  readonly name = 'prompt-based' as const;

  isSupported(_capabilities: ProviderCapabilities): boolean {
    // Always supported - this is the universal fallback
    return true;
  }

  async execute<T>(
    model: LanguageModelV3,
    messages: Message[],
    schema: z.ZodType<T>,
    options?: CompletionOptions
  ): Promise<T> {
    if (messages.length === 0) {
      throw new Error('Prompt-based strategy: No messages provided');
    }

    // Add schema description and strict JSON instructions
    const schemaDescription = zodSchemaToJsonDescription(schema);
    const lastMessage = messages[messages.length - 1]!;
    const enhancedMessages: Message[] = [
      ...messages.slice(0, -1),
      {
        role: lastMessage.role,
        content:
          lastMessage.content +
          `\n\nRespond ONLY with a valid JSON object matching this structure:\n${schemaDescription}\n\n` +
          'Do not include any other text, markdown formatting, or explanation. ' +
          'Output only the raw JSON object.'
      }
    ];

    const { text } = await generateText({
      model,
      messages: enhancedMessages,
      maxOutputTokens: options?.maxTokens,
      temperature: options?.temperature,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      providerOptions: options?.options as any
    });

    // Try to extract JSON from the response
    const jsonStr = extractJSON(text);

    // Try to parse
    try {
      const parsed = JSON.parse(jsonStr);
      return schema.parse(parsed);
    } catch (parseError) {
      // Try to salvage truncated JSON
      const salvaged = salvageJSON(jsonStr);
      if (salvaged) {
        try {
          const parsed = JSON.parse(salvaged);
          return schema.parse(parsed);
        } catch {
          // Salvage didn't help
        }
      }

      // Re-throw with context
      const error = parseError as Error;
      throw new Error(
        `Prompt-based strategy: Failed to parse JSON. ` +
          `Error: ${error.message}. ` +
          `Raw text (last 500 chars): ${text.slice(-500)}`
      );
    }
  }
}

export const promptBasedStrategy = new PromptBasedStrategyImpl();
