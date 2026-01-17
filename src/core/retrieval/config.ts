/**
 * Retrieval Pipeline Configuration
 *
 * Tuned defaults for the LAND → ANCHOR → EXPAND → DISTILL → TRACE pipeline.
 * These are internal tuning parameters, not exposed in user-facing config.
 *
 * The config is designed for experimentation - use createConfig() to override
 * any parameter and compare results.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════════

/** Deep partial type for nested overrides */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** LAND phase config - cast wide net with vector + fulltext search */
interface LandConfig {
  /** Number of seed candidates from vector+fulltext search (higher = better recall, slower) */
  readonly candidates: number;
}

/** ANCHOR phase config - find anchor entities from seed memories */
interface AnchorConfig {
  /** Minimum memories an entity must appear in to be considered an anchor */
  readonly minMemories: number;
  /** Signal weights for scoring anchor entities (must sum to 1.0) */
  readonly weights: {
    /** Direct similarity: entity embedding vs query embedding */
    readonly semantic: number;
    /** Indirect: average similarity of memories about this entity */
    readonly memory: number;
    /** Graph centrality: log(1 + degree) normalized */
    readonly structural: number;
  };
}

/** EXPAND phase config - walk graph outward from anchors via SEM-PPR */
interface ExpandConfig {
  /**
   * PPR damping factor. Controls exploration vs exploitation.
   * - 0.85 = traditional PageRank (too much exploration for KGs)
   * - 0.50 = HippoRAG (too conservative, misses 2-3 hop connections)
   * - 0.72-0.78 = optimal for knowledge graphs (research-backed)
   */
  readonly damping: number;
  /** Max iterations for PPR convergence */
  readonly iterations: number;
  /**
   * SEM-PPR structural weight (0-1).
   * Controls balance between PPR structure and semantic similarity.
   * - 0.0 = pure semantic (ignores graph structure)
   * - 0.5 = balanced (default, recommended)
   * - 1.0 = pure PPR (ignores semantic similarity)
   */
  readonly structuralWeight: number;
}

/** DISTILL phase config - fuse signals and select diverse results */
interface DistillConfig {
  /** Final number of memories to return */
  readonly topK: number;
  /** MMR lambda range - computed adaptively based on score distribution */
  readonly lambda: {
    /** Min lambda (favor diversity when many similar results) */
    readonly min: number;
    /** Max lambda (favor relevance when clear winner) */
    readonly max: number;
  };
}

/** TRACE phase config - follow invalidation history chain */
interface TraceConfig {
  /** Max depth for history chain traversal (2 = current → prev → prev's prev) */
  readonly maxDepth: number;
}

/** Score fusion config - used in LAND and DISTILL phases */
interface FusionConfig {
  /** Weight for vector (semantic) search (0-1). Fulltext weight is derived as 1 - vectorWeight. */
  readonly vectorWeight: number;
}

/** Complete retrieval pipeline configuration */
export interface RetrievalConfig {
  readonly land: LandConfig;
  readonly anchor: AnchorConfig;
  readonly expand: ExpandConfig;
  readonly distill: DistillConfig;
  readonly trace: TraceConfig;
  readonly fusion: FusionConfig;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * LAND - Cast wide net with vector + fulltext search
 */
const land = {
  candidates: 100
} as const satisfies LandConfig;

/**
 * ANCHOR - Find anchor entities from seed memories
 */
const anchor = {
  minMemories: 1,
  weights: {
    semantic: 0.5,
    memory: 0.3,
    structural: 0.2
  }
} as const satisfies AnchorConfig;

/**
 * EXPAND - Walk graph outward from anchors via SEM-PPR
 */
const expand = {
  damping: 0.75,
  iterations: 25,
  structuralWeight: 0.5 // Balanced: 50% PPR structure + 50% semantic
} as const satisfies ExpandConfig;

/**
 * DISTILL - Fuse signals and select diverse results
 */
const distill = {
  topK: 10,
  lambda: {
    min: 0.5,
    max: 0.7
  }
} as const satisfies DistillConfig;

/**
 * TRACE - Follow invalidation history chain
 */
const trace = {
  maxDepth: 2
} as const satisfies TraceConfig;

/**
 * Score Fusion - used in LAND and DISTILL
 *
 * Key tuning (validated through testing):
 * - 70/30 vector/fulltext base weights (semantic > keyword)
 */
const fusion = {
  vectorWeight: 0.7
} as const satisfies FusionConfig;

// ═══════════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════════

/** Default configuration with tuned values */
export const defaults = {
  land,
  anchor,
  expand,
  distill,
  trace,
  fusion
} as const satisfies RetrievalConfig;

/**
 * Create config with optional overrides. Designed for experimentation.
 *
 * @example
 * // Use defaults
 * const config = createConfig();
 *
 * // Override for faster tests
 * const testConfig = createConfig({
 *   land: { candidates: 5 },
 *   distill: { topK: 3 },
 * });
 *
 * // Experiment with different damping factors
 * const experimentConfig = createConfig({
 *   expand: { damping: 0.85 }  // Try traditional PageRank
 * });
 */
export function createConfig(overrides?: DeepPartial<RetrievalConfig>): RetrievalConfig {
  if (!overrides) return defaults;

  return {
    land: { ...defaults.land, ...overrides.land },
    anchor: {
      ...defaults.anchor,
      ...overrides.anchor,
      weights: { ...defaults.anchor.weights, ...overrides.anchor?.weights }
    },
    expand: { ...defaults.expand, ...overrides.expand },
    distill: {
      ...defaults.distill,
      ...overrides.distill,
      lambda: { ...defaults.distill.lambda, ...overrides.distill?.lambda }
    },
    trace: { ...defaults.trace, ...overrides.trace },
    fusion: { ...defaults.fusion, ...overrides.fusion }
  };
}
