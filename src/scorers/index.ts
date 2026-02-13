/**
 * Scorers index - exports all scorers and utilities.
 */

// Types
export type {
  ScoreResult,
  ScorerContext,
  CodeGenScorer,
  ScoreCategory,
} from "./types.js";
export { getScoreCategory } from "./types.js";

// Syntax scorers
export { isValidJS, hasAsyncAwait } from "./syntax/index.js";

// Semantic scorers
export { mustContain, mustNotContain } from "./semantic/index.js";

// Execution scorers
export { succeeds } from "./execution/index.js";

// Result scorers
export { searchIndexExists } from "./result/index.js";

// All scorers in a single array for convenience
import { isValidJS, hasAsyncAwait } from "./syntax/index.js";
import { mustContain, mustNotContain } from "./semantic/index.js";
import { succeeds } from "./execution/index.js";
import { searchIndexExists } from "./result/index.js";
import type { CodeGenScorer } from "./types.js";

/**
 * All available scorers.
 * Run all of these for every eval case - each scorer checks if its
 * expected field exists and returns score: null if it doesn't apply.
 */
export const allScorers: CodeGenScorer[] = [
  // Syntax
  isValidJS,
  hasAsyncAwait,
  // Semantic
  mustContain,
  mustNotContain,
  // Execution
  succeeds,
  // Result
  searchIndexExists,
];

