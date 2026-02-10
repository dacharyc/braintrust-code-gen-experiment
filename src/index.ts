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
  createScorer,
  taskBaseline,
  taskWithDocs,
  taskWithSkill,
  generationClient,
  scoringClient,
  GENERATION_MODEL,
  SCORING_MODEL,
  type TaskInput,
  type EvaluationConfig,
  type CodeScore,
  type ScorerConfig,
  type ValidationContext,
  type SemanticValidationResult,
  type ResultValidationResult,
} from "./harness/index.js";
