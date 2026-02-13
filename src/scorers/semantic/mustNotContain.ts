/**
 * Semantic scorer: MustNotContain
 *
 * Validates that the generated code does NOT contain certain patterns.
 * Useful for checking that the LLM didn't use incorrect APIs.
 * Each pattern becomes a separate assertion in Braintrust.
 */

import type { CodeGenScorer, ScoreResult } from "../types.js";

/**
 * Checks if the generated code does NOT contain forbidden patterns.
 *
 * Returns an array of ScoreResults, one for each pattern:
 * - score: 1 if pattern is NOT found (good)
 * - score: 0 if pattern IS found (bad)
 *
 * Returns a single result with score: null if no mustNotContain patterns are specified.
 */
export const mustNotContain: CodeGenScorer = async (context): Promise<ScoreResult | ScoreResult[]> => {
  const { output, expected } = context;
  const patterns = expected.semantic?.mustNotContain;

  // Check if this assertion applies
  if (!patterns || patterns.length === 0) {
    return { name: "Semantic_MustNotContain", score: null };
  }

  // Check each pattern and return a separate score for each
  return patterns.map(({ pattern, name }) => {
    const found = output.includes(pattern);
    return {
      name: `Semantic_${name}`,
      score: found ? 0 : 1, // 0 if found (bad), 1 if not found (good)
      metadata: {
        pattern,
        found,
        reason: found ? `Found forbidden pattern: ${pattern}` : undefined,
      },
    };
  });
};

