import type { EmbeddingProvider } from '@/config/schema';

export type { EmbeddingProvider };

export interface EmbeddingClient {
  /**
   * Generate embedding for a single text.
   * @param text - The text to embed (must not be empty)
   * @returns L2-normalized embedding vector
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts in a single request.
   * More efficient than calling embed() multiple times.
   * @param texts - Array of texts to embed (must not be empty, no empty strings)
   * @returns Array of L2-normalized embedding vectors (same order as input)
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * The dimensionality of embeddings produced by this client.
   * Set from embedding.dimensions in config/memento.json.
   */
  readonly dimensions: number;

  /**
   * The model identifier being used.
   */
  readonly modelId: string;
}
