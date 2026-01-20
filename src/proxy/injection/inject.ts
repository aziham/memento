/**
 * Generic Message Injection
 *
 * Single source of truth for injecting content into message bodies.
 * Works with any message format (OpenAI, Anthropic, Ollama) using structural typing.
 */

import type { ContentBlock } from '@/proxy/types';

/**
 * Message structure that can receive injected content.
 * Uses structural typing to work with OpenAI, Anthropic, and Ollama formats.
 */
interface Message {
  role: string;
  content: string | ContentBlock[];
}

/**
 * Request body with a messages array.
 * Generic constraint allows type-safe injection for any compatible format.
 */
interface MessageBody {
  messages?: Message[];
  [key: string]: unknown;
}

/**
 * Inject content into the last user message of a request body.
 *
 * Handles both string and array content formats:
 * - String content: prepends the memento content
 * - Array content: prepends a text block with the memento content
 *
 * @param body - Original request body (OpenAI, Anthropic, or Ollama format)
 * @param mementoContent - Formatted memento content (should be wrapped in <memento> tags)
 * @returns Modified request body with memento injected, preserving the original type
 *
 * @example
 * ```typescript
 * const body: OpenAIRequestBody = { messages: [{ role: 'user', content: 'Hello' }] };
 * const injected = injectIntoBody(body, '<memento>...</memento>\n\n');
 * // injected.messages[0].content === '<memento>...</memento>\n\nHello'
 * ```
 */
export function injectIntoBody<T extends MessageBody>(body: T, mementoContent: string): T {
  if (!body.messages || !mementoContent) {
    return body;
  }

  const messages = [...body.messages];

  // Find and modify the last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === 'user') {
      messages[i] = injectIntoMessage(msg, mementoContent);
      break;
    }
  }

  return { ...body, messages } as T;
}

/**
 * Inject content into a single message.
 * Handles both string and array content formats.
 */
function injectIntoMessage<T extends Message>(msg: T, mementoContent: string): T {
  if (typeof msg.content === 'string') {
    return { ...msg, content: `${mementoContent}${msg.content}` };
  }

  if (Array.isArray(msg.content)) {
    return {
      ...msg,
      content: [{ type: 'text', text: mementoContent }, ...msg.content]
    };
  }

  return msg;
}
