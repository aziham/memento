/**
 * Embedding Client Factory
 *
 * Creates embedding clients using Vercel AI SDK v6 with direct provider packages.
 * NO Vercel Gateway - all requests go directly to provider APIs.
 */

import { createCohere } from '@ai-sdk/cohere';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { defaultEmbeddingSettingsMiddleware, wrapEmbeddingModel } from 'ai';
import type { EmbeddingProvider } from '@/config/schema';
import { VercelEmbeddingClient } from './client';
import type { EmbeddingClient } from './types';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

export function createEmbeddingClient(
  provider: EmbeddingProvider,
  model: string,
  dimensions: number,
  options: {
    apiKey?: string;
    baseUrl?: string;
  } = {}
): EmbeddingClient {
  const embeddingModel = getEmbeddingModel(provider, model, dimensions, options);
  return new VercelEmbeddingClient(embeddingModel, dimensions);
}

function getEmbeddingModel(
  provider: EmbeddingProvider,
  model: string,
  dimensions: number,
  options: { apiKey?: string; baseUrl?: string }
): EmbeddingModelV3 {
  switch (provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: options.apiKey });
      // OpenAI supports dimensions via providerOptions
      return wrapWithDimensions(openai.embedding(model), 'openai', { dimensions });
    }

    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: options.apiKey });
      // Google uses outputDimensionality via providerOptions
      return wrapWithDimensions(google.embedding(model), 'google', {
        outputDimensionality: dimensions
      });
    }

    case 'cohere': {
      const cohere = createCohere({ apiKey: options.apiKey });
      // Cohere doesn't support dimension reduction
      return cohere.embedding(model);
    }

    case 'mistral': {
      const mistral = createMistral({ apiKey: options.apiKey });
      // Mistral doesn't support dimension reduction
      return mistral.embedding(model);
    }

    case 'ollama': {
      // Use OpenAI-compatible API for Ollama (supports /v1/embeddings)
      const ollamaProvider = createOpenAICompatible({
        name: 'ollama',
        baseURL: options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
        apiKey: 'ollama' // Required by SDK but not used by Ollama
      });
      return ollamaProvider.embeddingModel(model);
    }

    case 'openai-compatible': {
      if (!options.baseUrl) {
        throw new Error('baseUrl required for openai-compatible provider');
      }
      const openaiCompatible = createOpenAICompatible({
        name: 'openai-compatible',
        baseURL: options.baseUrl,
        apiKey: options.apiKey ?? ''
      });
      // Don't wrap with dimensions - not all endpoints support it
      return openaiCompatible.embeddingModel(model);
    }
  }
}

/**
 * Wrap an embedding model with default provider options (e.g., dimensions).
 * This sets the options once at model creation, not on every embed call.
 */
function wrapWithDimensions(
  model: EmbeddingModelV3,
  providerKey: string,
  providerOptions: Record<string, number>
): EmbeddingModelV3 {
  return wrapEmbeddingModel({
    model,
    middleware: defaultEmbeddingSettingsMiddleware({
      settings: {
        providerOptions: {
          [providerKey]: providerOptions
        }
      }
    })
  });
}
