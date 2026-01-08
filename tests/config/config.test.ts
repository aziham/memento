/**
 * Configuration System Tests
 *
 * Tests for the config loader and schema validation.
 * Focuses on {env:VAR} resolution and provider-specific validation.
 */

import { describe, expect, test } from 'bun:test';
import { configSchema } from '@/config/schema';
import { VALID_CUSTOM_PROVIDER_CONFIG, VALID_MINIMAL_CONFIG } from '../helpers/fixtures';

describe('configSchema', () => {
  describe('valid configurations', () => {
    test('accepts minimal OpenAI config', () => {
      const result = configSchema.safeParse(VALID_MINIMAL_CONFIG);
      expect(result.success).toBe(true);
    });

    test('accepts custom provider config with all required fields', () => {
      const result = configSchema.safeParse(VALID_CUSTOM_PROVIDER_CONFIG);
      expect(result.success).toBe(true);
    });

    test('applies server port default when not specified', () => {
      const result = configSchema.safeParse(VALID_MINIMAL_CONFIG);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.server.port).toBe(6366);
      }
    });

    test('merges consolidation config with defaults', () => {
      const config = {
        ...VALID_MINIMAL_CONFIG,
        llm: {
          ...VALID_MINIMAL_CONFIG.llm,
          consolidation: { temperature: 0.2 }
        }
      };
      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        // consolidation should have model from defaults + temperature override
        expect(result.data.llm.consolidation.model).toBe('gpt-4o-mini');
        expect(result.data.llm.consolidation.temperature).toBe(0.2);
      }
    });
  });

  describe('proxy provider validation', () => {
    test('rejects OpenAI provider with baseUrl', () => {
      const config = {
        ...VALID_MINIMAL_CONFIG,
        proxy: {
          provider: 'openai' as const,
          baseUrl: 'https://example.com'
        }
      };
      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('baseUrl not allowed'))).toBe(true);
      }
    });

    test('rejects custom provider without baseUrl', () => {
      const config = {
        ...VALID_MINIMAL_CONFIG,
        proxy: {
          provider: 'custom' as const,
          protocol: 'openai' as const,
          providerName: 'Test'
          // missing baseUrl
        }
      };
      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('baseUrl required'))).toBe(true);
      }
    });

    test('rejects custom provider without protocol', () => {
      const config = {
        ...VALID_MINIMAL_CONFIG,
        proxy: {
          provider: 'custom' as const,
          baseUrl: 'https://example.com',
          providerName: 'Test'
          // missing protocol
        }
      };
      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('protocol required'))).toBe(true);
      }
    });

    test('rejects custom provider without providerName', () => {
      const config = {
        ...VALID_MINIMAL_CONFIG,
        proxy: {
          provider: 'custom' as const,
          baseUrl: 'https://example.com',
          protocol: 'openai' as const
          // missing providerName
        }
      };
      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('providerName required'))).toBe(true);
      }
    });
  });

  describe('LLM provider validation', () => {
    test('rejects cloud provider without apiKey', () => {
      const config = {
        ...VALID_MINIMAL_CONFIG,
        llm: {
          provider: 'openai' as const,
          // missing apiKey
          defaults: { model: 'gpt-4o-mini' }
        }
      };
      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('apiKey required'))).toBe(true);
      }
    });

    test('rejects cloud provider with baseUrl', () => {
      const config = {
        ...VALID_MINIMAL_CONFIG,
        llm: {
          provider: 'openai' as const,
          apiKey: 'sk-test',
          baseUrl: 'https://example.com',
          defaults: { model: 'gpt-4o-mini' }
        }
      };
      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('baseUrl not allowed'))).toBe(true);
      }
    });

    test('rejects openai-compatible without baseUrl', () => {
      const config = {
        ...VALID_MINIMAL_CONFIG,
        llm: {
          provider: 'openai-compatible' as const,
          // missing baseUrl
          defaults: { model: 'custom-model' }
        }
      };
      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('baseUrl required'))).toBe(true);
      }
    });
  });

  describe('embedding provider validation', () => {
    test('rejects cloud provider without apiKey', () => {
      const config = {
        ...VALID_MINIMAL_CONFIG,
        embedding: {
          provider: 'openai' as const,
          model: 'text-embedding-3-small',
          dimensions: 1536
          // missing apiKey
        }
      };
      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('apiKey required'))).toBe(true);
      }
    });

    test('accepts ollama without apiKey', () => {
      const config = {
        ...VALID_MINIMAL_CONFIG,
        embedding: {
          provider: 'ollama' as const,
          model: 'nomic-embed-text',
          dimensions: 768
          // no apiKey needed for local ollama
        }
      };
      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });
});
