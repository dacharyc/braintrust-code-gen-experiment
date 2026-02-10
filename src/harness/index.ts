/**
 * Evaluation Harness
 *
 * Provides reusable infrastructure for comparing LLM code generation approaches:
 * 1. Baseline: LLM with realistic developer prompt (no extra help)
 * 2. With Documentation: Same prompt + documentation content fetched from URL
 * 3. With Skill: Same prompt + skill content from a local file
 *
 * Usage:
 * ```typescript
 * import { runEvaluation, TaskInput } from "./harness/index.js";
 *
 * const evalData = [{ input: {...}, expected: {...} }];
 * await runEvaluation({
 *   projectName: "My Project",
 *   evalData,
 *   scorer: myScorer,
 * });
 * ```
 */

import { Eval } from "braintrust";
import OpenAI from "openai";
import { fetchDocumentation } from "../utils/fetch-documentation.js";
import { readSkillFile } from "../utils/read-skill-file.js";
import { executeMongoDBCode } from "../utils/code-executor.js";

// =============================================================================
// SCORING TYPES
// =============================================================================

/** Score result returned by all scorers */
export interface CodeScore {
  name: string;
  score: number;
  metadata: {
    syntaxScore: number;
    semanticScore: number;
    executionScore: number;
    resultScore: number;
    checks: string[];
    errors?: string[];
    executionTime?: number;
  };
}

/** Context passed to semantic and result validators */
export interface ValidationContext {
  output: string;
  expected: any;
  checks: string[];
  errors: string[];
}

/** Result from semantic validation */
export interface SemanticValidationResult {
  score: number;
}

/** Result from result validation */
export interface ResultValidationResult {
  score: number;
}

/** Configuration for a topic-specific scorer */
export interface ScorerConfig {
  /** Name of the scorer (used in Braintrust dashboard) */
  name: string;
  /** Validates semantic correctness based on expected type */
  validateSemantics: (ctx: ValidationContext) => Promise<SemanticValidationResult>;
  /** Validates the actual result after execution */
  validateResult: (ctx: ValidationContext & { executionSucceeded: boolean }) => Promise<ResultValidationResult>;
}

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

/** Model used for code generation tasks */
export const GENERATION_MODEL = process.env.GENERATION_MODEL || "gpt-4o-mini";

/** Model used for LLM-based scoring (different from generation to avoid bias) */
export const SCORING_MODEL = process.env.SCORING_MODEL || "claude-sonnet-4-5-20250929";

// =============================================================================
// BRAINTRUST AI PROXY CLIENTS
// =============================================================================

/**
 * OpenAI client configured to use Braintrust AI Proxy for code generation.
 */
export const generationClient = new OpenAI({
  baseURL: "https://api.braintrust.dev/v1/proxy",
  apiKey: process.env.BRAINTRUST_API_KEY,
});

/**
 * OpenAI client configured to use Braintrust AI Proxy for scoring.
 */
export const scoringClient = new OpenAI({
  baseURL: "https://api.braintrust.dev/v1/proxy",
  apiKey: process.env.BRAINTRUST_API_KEY,
});

// =============================================================================
// TYPES
// =============================================================================

/** Input structure for evaluation task functions */
export interface TaskInput {
  /** The prompt to send to the LLM */
  prompt: string;
  /** URL to fetch documentation from (for "With Docs" approach) */
  docLink: string;
  /** Path to skill file (for "With Skill" approach) */
  skillFile?: string;
}

/** Configuration for running an evaluation */
export interface EvaluationConfig {
  /** Braintrust project name */
  projectName: string;
  /** Array of test cases with input and expected output */
  evalData: Array<{ input: TaskInput; expected: any }>;
  /** Scorer function to evaluate generated code */
  scorer: (args: { input: any; output: string; expected?: any }) => Promise<any>;
  /** Optional cleanup function to run between evaluations */
  cleanup?: () => Promise<void>;
}

// =============================================================================
// SYSTEM PROMPTS
// =============================================================================

const BASELINE_SYSTEM_PROMPT = `You are a helpful coding assistant. Generate Node.js code using the MongoDB driver.

Requirements:
- Use CommonJS syntax (require, not import)
- Use async/await
- Include error handling
- Return only executable code
- Do NOT wrap code in markdown code blocks or backticks
- No explanations or comments outside the code`;

// =============================================================================
// TASK FUNCTIONS
// =============================================================================

/**
 * Task function for baseline approach (no extra help)
 */
export async function taskBaseline(input: TaskInput, hooks?: any): Promise<string> {
  console.log(`[Baseline] Generating code with ${GENERATION_MODEL}...`);

  if (hooks) {
    hooks.metadata.generationModel = GENERATION_MODEL;
  }

  const response = await generationClient.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: "system", content: BASELINE_SYSTEM_PROMPT },
      { role: "user", content: input.prompt }
    ],
    temperature: 0.2,
  });
  return response.choices[0]?.message?.content || "";
}

/**
 * Task function with documentation content
 */
export async function taskWithDocs(input: TaskInput, hooks?: any): Promise<string> {
  console.log(`[WithDocs] Generating code with ${GENERATION_MODEL}...`);

  const docContent = await fetchDocumentation(input.docLink);

  const enhancedPrompt = `${input.prompt}

Use the following MongoDB documentation as reference:

${docContent}`;

  if (hooks) {
    hooks.metadata.actualPrompt = enhancedPrompt;
    hooks.metadata.docContentLength = docContent.length;
    hooks.metadata.generationModel = GENERATION_MODEL;
  }

  const response = await generationClient.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: "system", content: BASELINE_SYSTEM_PROMPT },
      { role: "user", content: enhancedPrompt }
    ],
    temperature: 0.2,
  });
  return response.choices[0]?.message?.content || "";
}

/**
 * Task function with skill/expertise from a file
 */
export async function taskWithSkill(input: TaskInput, hooks?: any): Promise<string> {
  console.log(`[WithSkill] Generating code with ${GENERATION_MODEL}...`);

  if (!input.skillFile) {
    throw new Error("skillFile is required for taskWithSkill");
  }
  const skillContent = await readSkillFile(input.skillFile);

  const systemPrompt = `You are a MongoDB expert assistant. Generate Node.js code using the MongoDB driver.

${skillContent}`;

  if (hooks) {
    hooks.metadata.skillFile = input.skillFile;
    hooks.metadata.skillContent = skillContent;
    hooks.metadata.userPrompt = input.prompt;
    hooks.metadata.generationModel = GENERATION_MODEL;
  }

  const response = await generationClient.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input.prompt }
    ],
    temperature: 0.2,
  });
  return response.choices[0]?.message?.content || "";
}

// =============================================================================
// EVALUATION RUNNER
// =============================================================================

/**
 * Run a complete evaluation comparing all three approaches.
 * Executes sequentially with cleanup between each to avoid resource conflicts.
 */
export async function runEvaluation(config: EvaluationConfig): Promise<void> {
  const { projectName, evalData, scorer, cleanup } = config;

  console.log(`\n🚀 Running Evaluation: ${projectName}\n`);
  console.log("Results will be logged to the Braintrust dashboard.");
  console.log("View your experiments at: https://www.braintrust.dev\n");
  console.log(`📊 Model Configuration:`);
  console.log(`   Generation: ${GENERATION_MODEL}`);
  console.log(`   Scoring:    ${SCORING_MODEL}\n`);

  // Initial cleanup
  if (cleanup) {
    console.log("🧹 Running initial cleanup...\n");
    await cleanup();
  }

  console.log("--- Evaluation 1: Baseline ---");
  await Eval(projectName, {
    experimentName: "Baseline",
    update: true,
    data: () => evalData,
    task: async (input: TaskInput, hooks) => taskBaseline(input, hooks),
    scores: [scorer],
  });

  if (cleanup) await cleanup();

  console.log("\n--- Evaluation 2: With Documentation ---");
  await Eval(projectName, {
    experimentName: "With Docs",
    update: true,
    data: () => evalData,
    task: async (input: TaskInput, hooks) => taskWithDocs(input, hooks),
    scores: [scorer],
  });

  if (cleanup) await cleanup();

  console.log("\n--- Evaluation 3: With Skill ---");
  await Eval(projectName, {
    experimentName: "With Skill",
    update: true,
    data: () => evalData,
    task: async (input: TaskInput, hooks) => taskWithSkill(input, hooks),
    scores: [scorer],
  });

  // Final cleanup
  if (cleanup) await cleanup();

  console.log("\n✅ All evaluations complete!");
}

// =============================================================================
// SCORER FACTORY
// =============================================================================

/**
 * Creates a scorer function with reusable syntax and execution validation.
 * Topic-specific scorers provide semantic and result validation.
 *
 * Scoring breakdown:
 * - Syntax: 25% (async/await, MongoDB imports)
 * - Semantic: 35% (topic-specific API usage)
 * - Execution: 20% (code runs without errors)
 * - Result: 20% (expected outcome achieved)
 */
export function createScorer(config: ScorerConfig) {
  return async function scorer(args: {
    input: any;
    output: string;
    expected?: any;
  }): Promise<CodeScore> {
    const { output, expected } = args;
    const checks: string[] = [];
    const errors: string[] = [];

    let syntaxScore = 0;
    let semanticScore = 0;
    let executionScore = 0;
    let resultScore = 0;

    // 1. SYNTAX VALIDATION (25% of score) - Reusable
    if (!output || output.trim().length === 0) {
      errors.push("No code generated");
      return {
        name: config.name,
        score: 0,
        metadata: { syntaxScore, semanticScore, executionScore, resultScore, checks, errors },
      };
    }

    if (output.includes("async") || output.includes("await") || output.includes("function")) {
      syntaxScore += 0.1;
      checks.push("✓ Contains async/await or function syntax");
    }

    if (output.includes("MongoClient") || output.includes("mongodb")) {
      syntaxScore += 0.15;
      checks.push("✓ Imports MongoDB driver");
    } else {
      errors.push("Missing MongoDB driver import");
    }

    // 2. SEMANTIC VALIDATION (35% of score) - Topic-specific
    const semanticResult = await config.validateSemantics({
      output,
      expected,
      checks,
      errors,
    });
    semanticScore = semanticResult.score;

    // 3. EXECUTION VALIDATION (20% of score) - Reusable
    let executionSucceeded = false;
    if (process.env.MONGODB_URI) {
      try {
        const execResult = await executeMongoDBCode(output);
        if (execResult.success) {
          executionScore = 0.2;
          executionSucceeded = true;
          checks.push("✓ Code executes without errors");
        } else {
          errors.push(`Execution error: ${execResult.error}`);
        }
      } catch (error: any) {
        errors.push(`Execution failed: ${error.message}`);
      }
    } else {
      checks.push("⚠ Skipping execution (no MONGODB_URI set)");
    }

    // 4. RESULT VALIDATION (20% of score) - Topic-specific
    const resultResult = await config.validateResult({
      output,
      expected,
      checks,
      errors,
      executionSucceeded,
    });
    resultScore = resultResult.score;

    const totalScore = syntaxScore + semanticScore + executionScore + resultScore;

    return {
      name: config.name,
      score: Math.min(totalScore, 1.0),
      metadata: {
        syntaxScore,
        semanticScore,
        executionScore,
        resultScore,
        checks,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  };
}
