/**
 * Scorer types for the code generation evaluation framework.
 *
 * All scorers follow a consistent pattern:
 * - Check if their expected field exists
 * - Return score: 1 (pass), 0 (fail), or null (doesn't apply)
 * - Return one or more named scores for Braintrust
 */

import type { EvalCaseExpected } from "../schemas/evalCase.js";

// =============================================================================
// SCORE RESULT TYPES
// =============================================================================

/**
 * A single score result from a scorer.
 *
 * - name: Identifier for this assertion (e.g., "Syntax_IsValidJS")
 * - score: 1 (pass), 0 (fail), or null (doesn't apply/skip)
 * - metadata: Optional additional context for debugging
 */
export interface ScoreResult {
  name: string;
  score: number | null;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// SCORER CONTEXT
// =============================================================================

/**
 * Context passed to all scorers.
 */
export interface ScorerContext {
  /** The generated code output from the LLM */
  output: string;
  /** The expected assertions from the eval case */
  expected: EvalCaseExpected;
  /** Result of code execution (if execution scorer ran) */
  executionResult?: {
    success: boolean;
    output?: unknown;
    error?: string;
    executionTime?: number;
  };
}

// =============================================================================
// SCORER FUNCTION TYPE
// =============================================================================

/**
 * A scorer function that evaluates generated code.
 *
 * Scorers can return:
 * - A single ScoreResult
 * - An array of ScoreResults (for scorers that check multiple patterns)
 */
export type CodeGenScorer = (
  context: ScorerContext
) => Promise<ScoreResult | ScoreResult[]>;

// =============================================================================
// SCORE CATEGORIES
// =============================================================================

/**
 * Categories for grouping scores.
 * Used for computing category compound scores.
 */
export type ScoreCategory = "syntax" | "semantic" | "execution" | "result";

/**
 * Maps score names to their categories for aggregation.
 */
export function getScoreCategory(scoreName: string): ScoreCategory {
  if (scoreName.startsWith("Syntax_")) return "syntax";
  if (scoreName.startsWith("Semantic_")) return "semantic";
  if (scoreName.startsWith("Execution_")) return "execution";
  if (scoreName.startsWith("Result_")) return "result";
  // Default to result for unknown categories
  return "result";
}

