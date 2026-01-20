import type { ProxyClient } from './types';

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

export class AnthropicProxyClient implements ProxyClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_ANTHROPIC_BASE_URL;
  }

  async chat(body: unknown, headers: Headers): Promise<Response> {
    return fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
  }
}
