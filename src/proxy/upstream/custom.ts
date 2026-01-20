import { AnthropicProxyClient } from './anthropic';
import { OpenAIProxyClient } from './openai';
import type { ProxyClient, UpstreamLLMProtocol } from './types';

/**
 * Custom proxy client that delegates to protocol-specific implementations.
 * Allows using any LLM service that speaks OpenAI or Anthropic protocol.
 */
export class CustomProxyClient implements ProxyClient {
  private delegate: ProxyClient;

  constructor(baseUrl: string, protocol: UpstreamLLMProtocol) {
    switch (protocol) {
      case 'openai':
        this.delegate = new OpenAIProxyClient(baseUrl);
        break;
      case 'anthropic':
        this.delegate = new AnthropicProxyClient(baseUrl);
        break;
      default: {
        const _exhaustive: never = protocol;
        throw new Error(`Unknown protocol: ${_exhaustive}`);
      }
    }
  }

  async chat(body: unknown, headers: Headers): Promise<Response> {
    return this.delegate.chat(body, headers);
  }
}
