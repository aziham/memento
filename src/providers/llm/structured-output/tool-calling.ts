/**
 * Tier 2: Tool Calling Strategy
 *
 * Uses tool/function calling to extract structured data.
 * The schema is converted to a tool definition, and the model is forced
 * to call that tool with the structured data as arguments.
 *
 * Supported by:
 * - Anthropic (Claude)
 * - OpenAI
 * - Google (Gemini)
 * - Most modern LLMs
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import { generateText, tool } from 'ai';
import type { z } from 'zod';
import type { CompletionOptions, Message } from '../types';
import type { ProviderCapabilities, StructuredOutputStrategy } from './types';

export class ToolCallingStrategyImpl implements StructuredOutputStrategy {
  readonly name = 'tool-calling' as const;

  isSupported(capabilities: ProviderCapabilities): boolean {
    return capabilities.supportsToolCalling;
  }

  async execute<T>(
    model: LanguageModelV3,
    messages: Message[],
    schema: z.ZodType<T>,
    options?: CompletionOptions
  ): Promise<T> {
    // Create a tool that captures the structured output
    // We don't provide an execute function - we just want the tool call args
    const extractTool = tool({
      description: 'Extract and return the structured data from the conversation',
      inputSchema: schema
    });

    const { steps } = await generateText({
      model,
      messages: [
        ...messages,
        {
          role: 'system' as const,
          content:
            'You must use the "extract" tool to provide your response. ' +
            'Do not respond with plain text - always use the tool.'
        }
      ],
      tools: { extract: extractTool },
      toolChoice: { type: 'tool', toolName: 'extract' },
      maxOutputTokens: options?.maxTokens,
      temperature: options?.temperature,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      providerOptions: options?.options as any
    });

    // Get the tool call result from the first step
    const firstStep = steps[0];
    if (!firstStep?.toolCalls?.length) {
      throw new Error('Tool calling strategy: No tool calls in response');
    }

    const toolCall = firstStep.toolCalls[0];
    if (!toolCall || toolCall.toolName !== 'extract') {
      throw new Error(`Tool calling strategy: Unexpected tool call: ${toolCall?.toolName}`);
    }

    // Access the input (args) from the tool call
    // The toolCall has the input property with the parsed arguments
    const input = 'input' in toolCall ? toolCall.input : undefined;
    if (input === undefined) {
      throw new Error('Tool calling strategy: No input in tool call');
    }

    // Validate with our schema to ensure type safety
    return schema.parse(input);
  }
}

export const toolCallingStrategy = new ToolCallingStrategyImpl();
