import type { ExtendedProxyClient } from './types';
import { sanitizeHeaders } from './utils';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

export class OllamaProxyClient implements ExtendedProxyClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
  }

  async chat(body: unknown, headers: Headers): Promise<Response> {
    // Default to OpenAI-compatible endpoint
    return fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: sanitizeHeaders(headers),
      body: JSON.stringify(body)
    });
  }

  async nativeChat(body: unknown, headers: Headers): Promise<Response> {
    return fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: sanitizeHeaders(headers),
      body: JSON.stringify(body)
    });
  }

  async generate(body: unknown, headers: Headers): Promise<Response> {
    return fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: sanitizeHeaders(headers),
      body: JSON.stringify(body)
    });
  }
}
