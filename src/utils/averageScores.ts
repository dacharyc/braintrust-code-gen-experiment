/**
 * Score aggregation utilities.
 *
 * Computes category compound scores and overall compound score
 * from individual assertion scores.
 */

import type { ScoreResult, ScoreCategory } from "../scorers/types.js";
import { getScoreCategory } from "../scorers/types.js";

/**
 * Result of score aggregation.
 */
export interface AggregatedScores {
  /** All individual assertion scores (including nulls filtered out) */
  individual: ScoreResult[];
  /** Category compound scores (Syntax, Semantic, Execution, Result) */
  categories: ScoreResult[];
  /** Overall compound score */
  compound: ScoreResult;
}

/**
 * Aggregate individual scores into category compounds and overall compound.
 *
 * Scoring hierarchy:
 * - Individual assertions are sent to Braintrust as-is
 * - Category compounds are the average of all assertions in that category
 * - Overall compound is the average of all category compounds
 *
 * Scores with null values are filtered out (they don't apply to this eval case).
 */
export function aggregateScores(scores: ScoreResult[]): AggregatedScores {
  // Filter out null scores (assertions that don't apply)
  const validScores = scores.filter((s) => s.score !== null) as Array<
    ScoreResult & { score: number }
  >;

  // Group scores by category
  const byCategory: Record<ScoreCategory, Array<ScoreResult & { score: number }>> = {
    syntax: [],
    semantic: [],
    execution: [],
    result: [],
  };

  for (const score of validScores) {
    const category = getScoreCategory(score.name);
    byCategory[category].push(score);
  }

  // Compute category averages
  const categories: ScoreResult[] = [];
  const categoryAverages: number[] = [];

  for (const [category, categoryScores] of Object.entries(byCategory)) {
    if (categoryScores.length > 0) {
      const avg =
        categoryScores.reduce((sum, s) => sum + s.score, 0) / categoryScores.length;
      categories.push({
        name: capitalize(category),
        score: avg,
        metadata: {
          count: categoryScores.length,
          assertions: categoryScores.map((s) => s.name),
        },
      });
      categoryAverages.push(avg);
    }
  }

  // Compute overall compound (average of category averages)
  const overallScore =
    categoryAverages.length > 0
      ? categoryAverages.reduce((sum, avg) => sum + avg, 0) / categoryAverages.length
      : 0;

  const compound: ScoreResult = {
    name: "CompoundCodeGenScore",
    score: overallScore,
    metadata: {
      categoryCount: categoryAverages.length,
      categories: categories.map((c) => c.name),
    },
  };

  return {
    individual: validScores,
    categories,
    compound,
  };
}

/**
 * Capitalize the first letter of a string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Flatten scorer results (which may be arrays) into a single array.
 */
export function flattenScores(results: Array<ScoreResult | ScoreResult[]>): ScoreResult[] {
  return results.flat();
}

