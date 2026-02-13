/**
 * Execution scorer: Succeeds
 *
 * Validates that the generated code executes successfully.
 * This scorer relies on the execution result being passed in the context.
 */

import type { CodeGenScorer, ScoreResult } from "../types.js";

/**
 * Checks if the generated code executed successfully.
 *
 * Returns:
 * - score: 1 if execution succeeded
 * - score: 0 if execution failed
 * - score: null if shouldSucceed assertion is not specified
 *
 * Note: This scorer expects executionResult to be populated in the context.
 * If executionResult is not present, it returns score: 0 with an error.
 */
export const succeeds: CodeGenScorer = async (context): Promise<ScoreResult> => {
  const { expected, executionResult } = context;

  // Check if this assertion applies
  if (expected.execution?.shouldSucceed !== true) {
    return { name: "Execution_Succeeds", score: null };
  }

  // Check if execution result is available
  if (!executionResult) {
    return {
      name: "Execution_Succeeds",
      score: 0,
      metadata: {
        error: "Execution result not available - code was not executed",
      },
    };
  }

  if (executionResult.success) {
    return {
      name: "Execution_Succeeds",
      score: 1,
      metadata: {
        executionTime: executionResult.executionTime,
        output: executionResult.output,
      },
    };
  }

  return {
    name: "Execution_Succeeds",
    score: 0,
    metadata: {
      error: executionResult.error,
      executionTime: executionResult.executionTime,
    },
  };
};

