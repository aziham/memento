/**
 * Vercel AI SDK v6 Embedding Client
 *
 * Wraps the AI SDK embed/embedMany functions with L2 normalization.
 */

import type { EmbeddingModel } from 'ai';
import { embed, embedMany } from 'ai';
import type { EmbeddingClient } from './types';
import { normalizeL2 } from './utils';

export class VercelEmbeddingClient implements EmbeddingClient {
  readonly modelId: string;
  readonly dimensions: number;

  constructor(
    private model: EmbeddingModel,
    dimensions: number
  ) {
    // Extract modelId from the model (handles string, V2, and V3 models)
    this.modelId = typeof model === 'string' ? model : model.modelId;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    if (!text || !text.trim()) {
      throw new Error('Cannot embed empty or whitespace-only text');
    }

    const { embedding } = await embed({
      model: this.model,
      value: text
    });

    return normalizeL2(embedding);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    for (const text of texts) {
      if (!text || !text.trim()) {
        throw new Error('Cannot embed empty or whitespace-only text');
      }
    }

    const { embeddings } = await embedMany({
      model: this.model,
      values: texts
    });

    return embeddings.map(normalizeL2);
  }
}
