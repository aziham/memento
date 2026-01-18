/**
 * Score normalization algorithms.
 * Used to make scores from different sources comparable.
 */

import type { ScoreDistribution } from '../types';

/**
 * Align a score distribution to a target distribution using z-score normalization.
 * This ensures scores from different sources (vector vs fulltext) are comparable.
 *
 * @param scores - Raw scores to align
 * @param targetDistribution - Target mean and standard deviation
 * @returns Aligned scores with the target distribution properties
 *
 * @example
 * // Vector scores (tight distribution: 0.82-0.89)
 * alignScoreDistribution([0.89, 0.85, 0.82], { mean: 0.5, standardDeviation: 0.2 })
 * // → [0.77, 0.50, 0.23]
 *
 * // BM25 scores (spread distribution: 3.2-52.3)
 * alignScoreDistribution([52.3, 18.7, 3.2], { mean: 0.5, standardDeviation: 0.2 })
 * // → [0.77, 0.44, 0.29]
 */
export function alignScoreDistribution(
  scores: number[],
  targetDistribution: ScoreDistribution
): number[] {
  if (scores.length === 0) return [];
  if (scores.length === 1) return [targetDistribution.mean];

  // Calculate source distribution statistics
  const sourceMean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const sourceVariance =
    scores.reduce((sum, score) => sum + (score - sourceMean) ** 2, 0) / scores.length;
  const sourceStd = Math.sqrt(sourceVariance);

  // Handle edge case: all scores identical
  if (sourceStd === 0) {
    return scores.map(() => targetDistribution.mean);
  }

  // Z-score normalize then scale to target distribution
  return scores.map(
    (score) =>
      targetDistribution.mean +
      ((score - sourceMean) / sourceStd) * targetDistribution.standardDeviation
  );
}

/**
 * Normalize scores to [0, 1] range using min-max scaling.
 *
 * @param scores - Scores to normalize
 * @returns Normalized scores in [0, 1] range
 */
export function normalizeToUnitRange(scores: number[]): number[] {
  if (scores.length === 0) return [];

  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  // Handle edge case: all scores identical
  if (maxScore === minScore) {
    return scores.map(() => 0.5);
  }

  return scores.map((score) => (score - minScore) / (maxScore - minScore));
}
