import type { ProxyClient } from './types';
import { sanitizeHeaders } from './utils';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export class OpenAIProxyClient implements ProxyClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_OPENAI_BASE_URL;
  }

  async chat(body: unknown, headers: Headers): Promise<Response> {
    return fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: sanitizeHeaders(headers),
      body: JSON.stringify(body)
    });
  }
}
