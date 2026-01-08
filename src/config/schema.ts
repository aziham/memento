import { z } from 'zod';

// Provider types
export const proxyProviders = ['openai', 'anthropic', 'ollama', 'custom'] as const;
export type ProxyProvider = (typeof proxyProviders)[number];

export const proxyProtocols = ['openai', 'anthropic'] as const;
export type ProxyProtocol = (typeof proxyProtocols)[number];

export const llmProviders = [
  'openai',
  'anthropic',
  'google',
  'ollama',
  'openai-compatible'
] as const;
export type LLMProvider = (typeof llmProviders)[number];

export const embeddingProviders = [
  'openai',
  'google',
  'cohere',
  'mistral',
  'ollama',
  'openai-compatible'
] as const;
export type EmbeddingProvider = (typeof embeddingProviders)[number];

// Operation config schema (for consolidation, retrieval)
const llmOperationSchema = z.object({
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).optional(),
  options: z.record(z.string(), z.unknown()).optional()
});
export type LLMOperationConfig = z.infer<typeof llmOperationSchema>;

// Config schema
export const configSchema = z
  .object({
    $schema: z.string().optional(),

    server: z
      .object({
        port: z.number().int().min(1).max(65535).default(6366)
      })
      .optional(),

    proxy: z
      .object({
        provider: z.enum(proxyProviders),
        baseUrl: z.string().url().optional(),
        protocol: z.enum(proxyProtocols).optional(),
        providerName: z.string().min(1).optional()
      })
      .superRefine((data, ctx) => {
        switch (data.provider) {
          case 'openai':
          case 'anthropic':
            if (data.baseUrl)
              ctx.addIssue({
                code: 'custom',
                path: ['baseUrl'],
                message: `baseUrl not allowed for provider '${data.provider}'`
              });
            if (data.protocol)
              ctx.addIssue({
                code: 'custom',
                path: ['protocol'],
                message: `protocol not allowed for provider '${data.provider}'`
              });
            if (data.providerName)
              ctx.addIssue({
                code: 'custom',
                path: ['providerName'],
                message: `providerName not allowed for provider '${data.provider}'`
              });
            break;
          case 'custom':
            if (!data.baseUrl)
              ctx.addIssue({
                code: 'custom',
                path: ['baseUrl'],
                message: "baseUrl required for provider 'custom'"
              });
            if (!data.protocol)
              ctx.addIssue({
                code: 'custom',
                path: ['protocol'],
                message: "protocol required for provider 'custom'"
              });
            if (!data.providerName)
              ctx.addIssue({
                code: 'custom',
                path: ['providerName'],
                message: "providerName required for provider 'custom'"
              });
            break;
          case 'ollama':
            if (data.protocol)
              ctx.addIssue({
                code: 'custom',
                path: ['protocol'],
                message: "protocol not allowed for provider 'ollama'"
              });
            if (data.providerName)
              ctx.addIssue({
                code: 'custom',
                path: ['providerName'],
                message: "providerName not allowed for provider 'ollama'"
              });
            break;
        }
      }),

    llm: z
      .object({
        provider: z.enum(llmProviders),
        providerName: z.string().min(1).optional(),
        apiKey: z.string().optional(),
        baseUrl: z.string().url().optional(),
        defaults: llmOperationSchema,
        consolidation: llmOperationSchema.partial().optional(),
        retrieval: llmOperationSchema.partial().optional()
      })
      .superRefine((data, ctx) => {
        const cloudProviders = ['openai', 'anthropic', 'google'];
        if (cloudProviders.includes(data.provider)) {
          if (!data.apiKey)
            ctx.addIssue({
              code: 'custom',
              path: ['apiKey'],
              message: `apiKey required for provider '${data.provider}'`
            });
          if (data.baseUrl)
            ctx.addIssue({
              code: 'custom',
              path: ['baseUrl'],
              message: `baseUrl not allowed for provider '${data.provider}'`
            });
          if (data.providerName)
            ctx.addIssue({
              code: 'custom',
              path: ['providerName'],
              message: `providerName not allowed for provider '${data.provider}'`
            });
        }
        if (data.provider === 'openai-compatible' && !data.baseUrl) {
          ctx.addIssue({
            code: 'custom',
            path: ['baseUrl'],
            message: "baseUrl required for provider 'openai-compatible'"
          });
        }
        if (data.provider !== 'openai-compatible' && data.providerName) {
          ctx.addIssue({
            code: 'custom',
            path: ['providerName'],
            message: "providerName only allowed for provider 'openai-compatible'"
          });
        }
      }),

    embedding: z
      .object({
        provider: z.enum(embeddingProviders),
        providerName: z.string().min(1).optional(),
        model: z.string().min(1),
        dimensions: z.number().int().positive(),
        apiKey: z.string().optional(),
        baseUrl: z.string().url().optional()
      })
      .superRefine((data, ctx) => {
        const cloudProviders = ['openai', 'google', 'cohere', 'mistral'];
        if (cloudProviders.includes(data.provider)) {
          if (!data.apiKey)
            ctx.addIssue({
              code: 'custom',
              path: ['apiKey'],
              message: `apiKey required for provider '${data.provider}'`
            });
          if (data.baseUrl)
            ctx.addIssue({
              code: 'custom',
              path: ['baseUrl'],
              message: `baseUrl not allowed for provider '${data.provider}'`
            });
          if (data.providerName)
            ctx.addIssue({
              code: 'custom',
              path: ['providerName'],
              message: `providerName not allowed for provider '${data.provider}'`
            });
        }
        if (data.provider === 'openai-compatible' && !data.baseUrl) {
          ctx.addIssue({
            code: 'custom',
            path: ['baseUrl'],
            message: "baseUrl required for provider 'openai-compatible'"
          });
        }
        if (data.provider !== 'openai-compatible' && data.providerName) {
          ctx.addIssue({
            code: 'custom',
            path: ['providerName'],
            message: "providerName only allowed for provider 'openai-compatible'"
          });
        }
      })
  })
  .transform((data) => {
    // Apply server defaults
    const server = {
      port: data.server?.port ?? 6366
    };

    // Merge operation configs with defaults
    const { defaults, consolidation, retrieval, ...llmRest } = data.llm;
    const llm = {
      ...llmRest,
      defaults,
      consolidation: { ...defaults, ...consolidation },
      retrieval: { ...defaults, ...retrieval }
    };

    return { ...data, server, llm };
  });

export type Config = z.infer<typeof configSchema>;
