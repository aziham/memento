---
description: Add a new configuration section with Zod validation
argument-hint: [section-name]
---

# Add Configuration Section: $ARGUMENTS

## Objective

Add a new configuration section called `$ARGUMENTS` to Memento's configuration system.

## Configuration System Design

Memento uses a JSON configuration file validated at startup with Zod. The system supports:

- **Zod schemas** for runtime validation with TypeScript type inference
- **Environment variable resolution** via `{env:VAR_NAME}` syntax
- **Sensible defaults** for optional fields
- **Fail-fast validation** - invalid config stops startup immediately

### File Structure

```
src/config/
├── schema.ts    # Zod schemas and type exports
├── config.ts    # Loader with env resolution
└── index.ts     # Public exports

config/
├── memento.json          # User config (gitignored)
└── memento.example.json  # Template for users
```

## Implementation

### Step 1: Define the Zod Schema

Add your section schema to `src/config/schema.ts`:

```typescript
import { z } from 'zod';

// Define the section schema
const yourSectionSchema = z.object({
  // Required field
  provider: z
    .enum(['option1', 'option2', 'option3'])
    .describe('Which provider to use'),

  // Required with environment variable support
  apiKey: z.string().describe('API key (use {env:YOUR_API_KEY})'),

  // Optional with default
  model: z.string().default('default-model').describe('Model identifier'),

  // Optional number with default
  timeout: z.number().default(5000).describe('Timeout in milliseconds'),

  // Optional boolean
  enabled: z.boolean().default(true).describe('Enable this feature'),

  // Nested optional object with defaults
  advanced: z
    .object({
      retries: z.number().default(3),
      backoffMs: z.number().default(1000)
    })
    .default({})
});

// Export inferred type
export type YourSectionConfig = z.infer<typeof yourSectionSchema>;
```

### Step 2: Add to Main Config Schema

Include your section in the root config schema:

```typescript
const configSchema = z.object({
  server: serverConfigSchema,
  proxy: proxyConfigSchema,
  llm: llmConfigSchema,
  embedding: embeddingConfigSchema,
  yourSection: yourSectionSchema // Add here
});

export type Config = z.infer<typeof configSchema>;
```

### Step 3: Environment Variable Resolution

The config loader resolves `{env:VAR_NAME}` patterns. Implement in `src/config/config.ts`:

```typescript
function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    const match = obj.match(/^\{env:(\w+)\}$/);
    if (match) {
      const envVar = match[1];
      const value = process.env[envVar];
      if (!value) {
        throw new Error(`Environment variable ${envVar} is not set`);
      }
      return value;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }

  if (obj && typeof obj === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveEnvVars(value);
    }
    return resolved;
  }

  return obj;
}
```

### Step 4: Config Loader

```typescript
import { readFileSync } from 'fs';
import { configSchema } from './schema';

const DEFAULT_CONFIG_PATH = 'config/memento.json';

let cachedConfig: Config | null = null;

export function loadConfig(path?: string): Config {
  if (cachedConfig) return cachedConfig;

  const configPath = path ?? process.env.MEMENTO_CONFIG ?? DEFAULT_CONFIG_PATH;
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const resolved = resolveEnvVars(parsed);

  const result = configSchema.safeParse(resolved);
  if (!result.success) {
    console.error('Invalid configuration:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function getConfig(): Config {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}
```

### Step 5: Update Example Config

Add the section to `config/memento.example.json`:

```json
{
  "server": {
    "port": 6366
  },
  "yourSection": {
    "provider": "option1",
    "apiKey": "{env:YOUR_API_KEY}",
    "model": "default-model",
    "timeout": 5000,
    "enabled": true,
    "advanced": {
      "retries": 3,
      "backoffMs": 1000
    }
  }
}
```

### Step 6: Document Environment Variables

Add to `.env.example`:

```bash
# Your Section
YOUR_API_KEY=your-api-key-here
```

## Schema Patterns

### Provider Selection Pattern

For sections with multiple provider options:

```typescript
const providerSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('openai'),
    apiKey: z.string(),
    model: z.string().default('gpt-4')
  }),
  z.object({
    provider: z.literal('anthropic'),
    apiKey: z.string(),
    model: z.string().default('claude-3-sonnet')
  }),
  z.object({
    provider: z.literal('ollama'),
    baseUrl: z.string().default('http://localhost:11434'),
    model: z.string()
  })
]);
```

### Operation Defaults Pattern

For operations with shared defaults:

```typescript
const operationDefaultsSchema = z.object({
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().default(4096),
  timeout: z.number().default(30000)
});

const llmConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'ollama']),
  apiKey: z.string().optional(),
  defaults: operationDefaultsSchema.default({}),
  // Override defaults for specific operations
  consolidation: operationDefaultsSchema.partial().default({}),
  retrieval: operationDefaultsSchema.partial().default({})
});
```

### Merge Defaults at Runtime

```typescript
function getOperationConfig(
  config: LLMConfig,
  operation: 'consolidation' | 'retrieval'
): OperationDefaults {
  return {
    ...config.defaults,
    ...config[operation]
  };
}
```

## Validation

After adding your section:

```bash
# Type check
bun run typecheck

# Test config loading
bun run start
# Should fail fast with clear error if config is invalid
```

## Checklist

- [ ] Zod schema defined with `.describe()` on all fields
- [ ] Type exported via `z.infer<typeof schema>`
- [ ] Added to main `configSchema`
- [ ] Example config updated
- [ ] Environment variables documented in `.env.example`
- [ ] Defaults provided for optional fields
- [ ] Config loads without errors
