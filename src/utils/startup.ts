/**
 * Startup Display
 *
 * Displays initialization steps and server info.
 * Provides an animated, professional startup experience.
 */

import type { Config } from '@/config/schema';
import { c, colors } from './colors';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface StartupInfo {
  /** Neo4j connection URI */
  neo4jUri: string;
  /** Embedding provider and model info */
  embedding: {
    provider: string;
    model: string;
    dimensions: number;
  };
  /** LLM provider and model info */
  llm: {
    provider: string;
    model: string;
  };
}

// ═════════════════════════════════════��═════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/** Delay between initialization steps (ms) */
const STEP_DELAY = 50;

/** Divider line */
const DIVIDER = '━'.repeat(78);

// ═══════════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Log an initialization step with checkmark.
 */
function logStep(label: string, detail?: string): void {
  const check = c.brightGreen('✓');
  const labelText = c.white(label);
  const detailText = detail ? `${colors.dim}${detail}${colors.reset}` : '';

  // Align details to column 30
  const padding = Math.max(1, 26 - label.length);
  console.log(`  ${check} ${labelText}${' '.repeat(padding)}${detailText}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Startup Display
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Display the complete startup sequence with animation.
 * Note: The banner should be displayed separately before calling this.
 */
export async function displayStartup(config: Config, info: StartupInfo): Promise<void> {
  // Initialization header
  console.log(`\n  ${c.dim('Initializing...')}\n`);

  // Step 1: Configuration
  await sleep(STEP_DELAY);
  logStep('Configuration loaded');

  // Step 2: Neo4j
  await sleep(STEP_DELAY);
  logStep('Neo4j connected', info.neo4jUri);

  // Step 3: Embedding client
  await sleep(STEP_DELAY);
  const embeddingInfo = `${info.embedding.provider}/${info.embedding.model} (${info.embedding.dimensions}d)`;
  logStep('Embedding client ready', embeddingInfo);

  // Step 4: LLM client
  await sleep(STEP_DELAY);
  const llmInfo = `${info.llm.provider}/${info.llm.model}`;
  logStep('LLM client ready', llmInfo);

  // Divider
  console.log(`\n  ${c.dim(DIVIDER)}\n`);

  // Server info
  const port = config.server.port;
  const url = `http://localhost:${port}`;
  console.log(`  ${c.white('Server ready on')} ${c.brightCyan(url)}\n`);

  // Endpoints
  console.log(`  ${c.white('Endpoints:')}`);
  displayEndpoint('POST', '/v1', 'LLM proxy with memory injection');
  displayEndpoint('POST', '/mcp', 'Model Context Protocol (note storage)');
  displayEndpoint('GET', '/health', 'Health check');

  // Final divider
  console.log(`\n  ${c.dim(DIVIDER)}\n`);
}

/**
 * Display a single endpoint.
 */
function displayEndpoint(method: string, path: string, description: string): void {
  const methodColor = method === 'GET' ? c.brightGreen : c.brightYellow;
  const methodText = methodColor(method.padEnd(6));
  const pathText = c.cyan(path.padEnd(24));
  const descText = c.dim(description);
  console.log(`    • ${methodText} ${pathText} ${descText}`);
}

/**
 * Build startup info from config and environment.
 */
export function buildStartupInfo(config: Config): StartupInfo {
  return {
    neo4jUri: process.env['NEO4J_URI'] ?? 'bolt://localhost:7687',
    embedding: {
      provider: config.embedding.provider,
      model: config.embedding.model,
      dimensions: config.embedding.dimensions
    },
    llm: {
      provider: config.llm.provider,
      model: config.llm.defaults.model
    }
  };
}
