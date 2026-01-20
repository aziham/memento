import { AnthropicProxyClient } from './anthropic';
import { CustomProxyClient } from './custom';
import { OllamaProxyClient } from './ollama';
import { OpenAIProxyClient } from './openai';
import type { ProxyClient, UpstreamLLMProtocol, UpstreamLLMProvider } from './types';

export function createProxyClient(
  provider: UpstreamLLMProvider,
  baseUrl?: string,
  protocol?: UpstreamLLMProtocol
): ProxyClient {
  switch (provider) {
    case 'openai':
      return new OpenAIProxyClient();
    case 'anthropic':
      return new AnthropicProxyClient();
    case 'custom':
      if (!baseUrl) {
        throw new Error('baseUrl is required for custom provider');
      }
      if (!protocol) {
        throw new Error('protocol is required for custom provider');
      }
      return new CustomProxyClient(baseUrl, protocol);
    case 'ollama':
      return new OllamaProxyClient(baseUrl);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}
