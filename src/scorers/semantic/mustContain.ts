/**
 * Semantic scorer: MustContain
 *
 * Validates that the generated code contains required patterns.
 * Each pattern becomes a separate assertion in Braintrust.
 */

import type { CodeGenScorer, ScoreResult } from "../types.js";

/**
 * Checks if the generated code contains all required patterns.
 *
 * Returns an array of ScoreResults, one for each pattern:
 * - score: 1 if pattern is found in the code
 * - score: 0 if pattern is not found
 *
 * Returns a single result with score: null if no mustContain patterns are specified.
 */
export const mustContain: CodeGenScorer = async (context): Promise<ScoreResult | ScoreResult[]> => {
  const { output, expected } = context;
  const patterns = expected.semantic?.mustContain;

  // Check if this assertion applies
  if (!patterns || patterns.length === 0) {
    return { name: "Semantic_MustContain", score: null };
  }

  // Check each pattern and return a separate score for each
  return patterns.map(({ pattern, name }) => {
    const found = output.includes(pattern);
    return {
      name: `Semantic_${name}`,
      score: found ? 1 : 0,
      metadata: {
        pattern,
        found,
      },
    };
  });
};

