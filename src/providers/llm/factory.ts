/**
 * LLM Client Factory
 *
 * Creates LLM clients using Vercel AI SDK v6 with direct provider packages.
 * NO Vercel Gateway - all requests go directly to provider APIs.
 *
 * Also detects provider capabilities for the tiered strategy system.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { LLMProvider } from '@/config/schema';
import { VercelLLMClient } from './client';
import { getDefaultCapabilities, type ProviderCapabilities } from './structured-output';
import type { LLMClient } from './types';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

export interface CreateLLMClientOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Override default capability detection */
  capabilities?: Partial<ProviderCapabilities>;
}

export function createLLMClient(
  provider: LLMProvider,
  model: string,
  options: CreateLLMClientOptions = {}
): LLMClient {
  const languageModel = getLanguageModel(provider, model, options);
  const capabilities = getCapabilitiesForProvider(provider, options.capabilities);
  return new VercelLLMClient(languageModel, capabilities);
}

/**
 * Get provider capabilities, merging defaults with any overrides.
 */
function getCapabilitiesForProvider(
  provider: LLMProvider,
  overrides?: Partial<ProviderCapabilities>
): ProviderCapabilities {
  const defaults = getDefaultCapabilities(provider);
  return {
    ...defaults,
    ...overrides,
    provider // Always use the actual provider
  };
}

function getLanguageModel(
  provider: LLMProvider,
  model: string,
  options: CreateLLMClientOptions
): LanguageModelV3 {
  switch (provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: options.apiKey });
      return openai(model);
    }

    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: options.apiKey });
      return anthropic(model);
    }

    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: options.apiKey });
      return google(model);
    }

    case 'ollama': {
      // Use OpenAI-compatible API for Ollama (supports /v1/chat/completions)
      const ollamaProvider = createOpenAICompatible({
        name: 'ollama',
        baseURL: options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
        apiKey: 'ollama' // Required by SDK but not used by Ollama
      });
      return ollamaProvider.languageModel(model);
    }

    case 'openai-compatible': {
      if (!options.baseUrl) {
        throw new Error('baseUrl required for openai-compatible provider');
      }
      const openaiCompatible = createOpenAICompatible({
        name: 'openai-compatible',
        baseURL: options.baseUrl,
        apiKey: options.apiKey ?? '',
        supportsStructuredOutputs: true
      });
      return openaiCompatible.languageModel(model);
    }

    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}
