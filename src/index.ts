/**
 * MongoDB Code Generation Evaluation
 *
 * This project evaluates LLM effectiveness at generating MongoDB code by comparing
 * three approaches:
 *
 * 1. Baseline: LLM with a realistic developer prompt (no extra help)
 * 2. With Documentation: Same prompt + actual documentation content
 * 3. With Skill: Same prompt + custom MongoDB expertise in the system prompt
 *
 * To run the evaluation:
 * 1. Copy .env.example to .env and fill in your credentials
 * 2. Run: npm run compare
 */

// Re-export harness for use in other evaluation scripts
export {
  runEvaluation,
  taskBaseline,
  taskWithDocs,
  taskWithSkill,
  generationClient,
  scoringClient,
  GENERATION_MODEL,
  SCORING_MODEL,
  type TaskInput,
  type EvaluationConfig,
} from "./harness/index.js";

// Re-export schemas
export {
  EvalCaseSchema,
  EvalCasesSchema,
  type EvalCase,
  type EvalCaseInput,
  type EvalCaseExpected,
  type EvalCaseCleanup,
  type Pattern,
} from "./schemas/evalCase.js";

// Re-export scorers
export {
  allScorers,
  isValidJS,
  hasAsyncAwait,
  mustContain,
  mustNotContain,
  succeeds,
  searchIndexExists,
  type ScoreResult,
  type ScorerContext,
  type CodeGenScorer,
  type ScoreCategory,
} from "./scorers/index.js";

// Re-export utilities
export { loadEvalCasesFromFile, loadEvalCasesFromDirectory, filterByTags } from "./utils/loadEvalCases.js";
export { aggregateScores, flattenScores, type AggregatedScores } from "./utils/averageScores.js";
export { runCleanup, dropSearchIndex } from "./utils/cleanup.js";
