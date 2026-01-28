import type { ExtendedProxyClient } from './types';
import { sanitizeHeaders } from './utils';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

export class OllamaProxyClient implements ExtendedProxyClient {
  private baseUrl: string;
  private normalizedBase: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
    // Normalize baseUrl to handle both formats:
    // - Local: http://localhost:11434 -> http://localhost:11434
    // - Cloud: https://ollama.com/api -> https://ollama.com
    this.normalizedBase = this.baseUrl.replace(/\/api\/?$/, '');
  }

  async chat(body: unknown, headers: Headers): Promise<Response> {
    // OpenAI-compatible endpoint
    return fetch(`${this.normalizedBase}/v1/chat/completions`, {
      method: 'POST',
      headers: sanitizeHeaders(headers),
      body: JSON.stringify(body)
    });
  }

  async nativeChat(body: unknown, headers: Headers): Promise<Response> {
    // Ollama native chat endpoint
    return fetch(`${this.normalizedBase}/api/chat`, {
      method: 'POST',
      headers: sanitizeHeaders(headers),
      body: JSON.stringify(body)
    });
  }

  async generate(body: unknown, headers: Headers): Promise<Response> {
    // Ollama generate endpoint
    return fetch(`${this.normalizedBase}/api/generate`, {
      method: 'POST',
      headers: sanitizeHeaders(headers),
      body: JSON.stringify(body)
    });
  }
}
