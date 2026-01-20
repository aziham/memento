/**
 * Injection Module
 *
 * Exports functions for injecting memento content into LLM request bodies.
 */

// XML formatting for retrieval output
export { formatRetrievalAsXML } from './formatter';
// Generic injection (single source of truth)
export { injectIntoBody } from './inject';

/**
 * Wrap content in <memento> tags for injection.
 * Adds trailing newlines for clean separation from user message.
 *
 * @param content - Raw content to wrap (typically XML-formatted retrieval output)
 * @returns Content wrapped in memento tags with proper spacing
 */
export function wrapInMementoTags(content: string): string {
  return `<memento>\n${content}\n</memento>\n\n`;
}
