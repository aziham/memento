/**
 * Retrieval Algorithms
 *
 * All algorithms for retrieval and consolidation pipelines.
 */

// Fusion algorithms
export { computeCoverageAdjustedWeights, fuseSearchResults } from './fusion';
// MMR algorithms
export { computeAdaptiveLambda, mmrRerank } from './mmr';
// Normalization algorithms
export { alignScoreDistribution, normalizeToUnitRange } from './normalize';
// Semantic PPR algorithms
export { applySemanticPPRBoost, defaultSemanticPPRConfig } from './sem-ppr';
// Similarity algorithms
export { computeCosineSimilarity } from './similarity';

// Entity weight algorithms
export { computeMultiSignalEntityWeights, normalizeEntityWeights } from './weights';
