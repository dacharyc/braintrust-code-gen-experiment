/**
 * Syntax scorer: HasAsyncAwait
 *
 * Validates that the generated code uses async/await patterns.
 * This is important for MongoDB operations which are asynchronous.
 */

import type { CodeGenScorer, ScoreResult } from "../types.js";

/**
 * Checks if the generated code uses async/await patterns.
 *
 * Returns:
 * - score: 1 if code contains both async and await keywords
 * - score: 0 if code is missing async/await
 * - score: null if hasAsyncAwait assertion is not specified
 */
export const hasAsyncAwait: CodeGenScorer = async (context): Promise<ScoreResult> => {
  const { output, expected } = context;

  // Check if this assertion applies
  if (expected.syntax?.hasAsyncAwait !== true) {
    return { name: "Syntax_HasAsyncAwait", score: null };
  }

  const hasAsync = /\basync\b/.test(output);
  const hasAwait = /\bawait\b/.test(output);

  if (hasAsync && hasAwait) {
    return {
      name: "Syntax_HasAsyncAwait",
      score: 1,
      metadata: { hasAsync: true, hasAwait: true },
    };
  }

  return {
    name: "Syntax_HasAsyncAwait",
    score: 0,
    metadata: {
      hasAsync,
      hasAwait,
      reason: !hasAsync && !hasAwait
        ? "Missing both async and await"
        : !hasAsync
          ? "Missing async keyword"
          : "Missing await keyword",
    },
  };
};

