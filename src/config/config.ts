/**
 * Config Loader
 *
 * Loads config/memento.json with {env:VAR} resolution.
 * Supports MEMENTO_CONFIG env var to override config path.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Config, configSchema } from './schema';

const DEFAULT_CONFIG_PATH = 'config/memento.json';

/**
 * Resolve {env:VAR} patterns in text.
 * Returns empty string if env var is not set.
 */
function resolveEnvVars(text: string): string {
  return text.replace(/\{env:([A-Z_][A-Z0-9_]*)\}/g, (_, varName) => {
    return process.env[varName] ?? '';
  });
}

/**
 * Load and validate config from file.
 */
function loadConfig(configPath: string): Config {
  let text: string;
  try {
    text = readFileSync(configPath, 'utf-8');
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      console.error(`Config file not found: ${configPath}`);
      console.error('Copy config/memento.example.json to config/memento.json and configure it.');
      process.exit(1);
    }
    throw err;
  }

  text = resolveEnvVars(text);

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`Invalid JSON in config file: ${configPath}`);
    process.exit(1);
  }

  const result = configSchema.safeParse(data);
  if (!result.success) {
    console.error('Invalid config:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

// Lazy load and cache
let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (!cachedConfig) {
    const configPath = process.env['MEMENTO_CONFIG'] ?? resolve(process.cwd(), DEFAULT_CONFIG_PATH);
    cachedConfig = loadConfig(configPath);
  }
  return cachedConfig;
}

/**
 * Get display name for proxy provider.
 * For custom providers, returns the configured providerName.
 */
export function getProxyDisplayName(config: Config): string {
  if (config.proxy.provider === 'custom') {
    return config.proxy.providerName ?? 'Custom';
  }
  return config.proxy.provider.charAt(0).toUpperCase() + config.proxy.provider.slice(1);
}

export const config = getConfig();
