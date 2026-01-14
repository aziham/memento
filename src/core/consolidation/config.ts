/**
 * Consolidation Pipeline Configuration
 *
 * Internal tuning parameters for the consolidation pipeline.
 * These are hardcoded defaults - not exposed in memento.json.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for context retrieval during consolidation.
 */
export interface ConsolidationSearchConfig {
  /** Maximum existing memories to retrieve for resolution (default: 15) */
  readonly contextTopK: number;
  /** Temperature for HyDE document generation (default: 0.7) */
  readonly hydeTemperature: number;
  /** Results per HyDE document vector search (default: 10) */
  readonly hydeResultsPerDoc: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default configuration values.
 *
 * - contextTopK: 15 memories for resolution context
 * - hydeTemperature: 0.7 for diverse but grounded HyDE documents
 * - hydeResultsPerDoc: 10 results per HyDE document search
 */
export const defaults: ConsolidationSearchConfig = {
  contextTopK: 15,
  hydeTemperature: 0.7,
  hydeResultsPerDoc: 10
};

/**
 * Create config with optional overrides.
 *
 * @example
 * // Use defaults
 * const config = createConfig();
 *
 * // Override for testing
 * const testConfig = createConfig({ contextTopK: 5 });
 */
export function createConfig(
  overrides?: Partial<ConsolidationSearchConfig>
): ConsolidationSearchConfig {
  if (!overrides) return defaults;
  return { ...defaults, ...overrides };
}
