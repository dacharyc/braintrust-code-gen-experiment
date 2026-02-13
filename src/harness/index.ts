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
 * import { runEvaluation } from "./harness/index.js";
 * import { loadEvalCasesFromFile } from "./utils/loadEvalCases.js";
 *
 * const evalCases = loadEvalCasesFromFile("evalCases/search/index-creation.yml");
 * await runEvaluation({
 *   projectName: "My Project",
 *   evalCases,
 * });
 * ```
 */

import { Eval } from "braintrust";
import OpenAI from "openai";
import { fetchDocumentationWithInfo } from "../utils/fetch-documentation.js";
import { readSkillFiles } from "../utils/read-skill-file.js";
import { executeMongoDBCode } from "../utils/code-executor.js";
import { runCleanup } from "../utils/cleanup.js";
import { aggregateScores, flattenScores } from "../utils/averageScores.js";
import { allScorers, type ScorerContext, type ScoreResult } from "../scorers/index.js";
import type { EvalCase, EvalCaseExpected } from "../schemas/evalCase.js";

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

/** Model used for code generation tasks */
export const GENERATION_MODEL = process.env.GENERATION_MODEL || "gpt-4o";

/** Model used for LLM-based scoring (different from generation to avoid bias) */
export const SCORING_MODEL = process.env.SCORING_MODEL || "claude-sonnet-4-5-20250929";

// =============================================================================
// BRAINTRUST AI PROXY CLIENTS
// =============================================================================

/**
 * API key for AI Proxy LLM access.
 * Falls back to BRAINTRUST_API_KEY if BRAINTRUST_AI_PROXY_KEY is not set.
 */
const AI_PROXY_KEY = process.env.BRAINTRUST_AI_PROXY_KEY || process.env.BRAINTRUST_API_KEY;

/**
 * OpenAI client configured to use Braintrust AI Proxy for code generation.
 */
export const generationClient = new OpenAI({
  baseURL: "https://api.braintrust.dev/v1/proxy",
  apiKey: AI_PROXY_KEY,
});

/**
 * OpenAI client configured to use Braintrust AI Proxy for scoring.
 */
export const scoringClient = new OpenAI({
  baseURL: "https://api.braintrust.dev/v1/proxy",
  apiKey: AI_PROXY_KEY,
});

// =============================================================================
// TYPES
// =============================================================================

/** Input structure for evaluation task functions (derived from EvalCase.input) */
export interface TaskInput {
  /** The prompt to send to the LLM */
  prompt: string;
  /** URL to fetch documentation from (for "With Docs" approach) */
  docLink?: string;
  /** Path(s) to skill file(s) (for "With Skill" approach) - can be a single path or array */
  skillFiles?: string | string[];
}

/** Configuration for running an evaluation */
export interface EvaluationConfig {
  /** Braintrust project name */
  projectName: string;
  /** Array of eval cases loaded from YAML */
  evalCases: EvalCase[];
}

// =============================================================================
// SYSTEM PROMPTS
// =============================================================================

const BASELINE_SYSTEM_PROMPT = `You are a helpful coding assistant. Generate Node.js code using the MongoDB driver.

Requirements:
- Use CommonJS syntax (require, not import)
- Use async/await
- Include error handling
- Get the MongoDB connection string from the MONGODB_URI environment variable (process.env.MONGODB_URI)
- Do NOT hardcode connection strings like "mongodb://localhost:27017"
- Return only executable code
- Do NOT wrap code in markdown code blocks or backticks
- No explanations or comments outside the code`;

/**
 * Strip markdown code blocks from LLM output.
 * LLMs sometimes wrap code in \`\`\`javascript ... \`\`\` despite being told not to.
 * Also handles cases where there's explanatory text before/after the code block.
 */
function stripMarkdownCodeBlocks(code: string): string {
  const trimmed = code.trim();

  // Try to extract code from a markdown code block anywhere in the output
  // This handles cases where there's text before or after the code block
  const codeBlockRegex = /```(?:\w+)?\s*\n([\s\S]*?)\n```/;
  const match = trimmed.match(codeBlockRegex);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Handle case where the entire output is wrapped in code blocks (no newline after language)
  const fullWrapRegex = /^```(?:\w+)?\s*([\s\S]*?)```$/;
  const fullMatch = trimmed.match(fullWrapRegex);
  if (fullMatch && fullMatch[1]) {
    return fullMatch[1].trim();
  }



  // Handle partial wrapping - just strip the markers
  let cleaned = trimmed;
  // Remove leading ``` with optional language identifier
  cleaned = cleaned.replace(/^```(?:\w+)?\s*\n?/, '');
  // Remove trailing ```
  cleaned = cleaned.replace(/\n?```\s*$/, '');

  return cleaned.trim();
}

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
  const rawOutput = response.choices[0]?.message?.content || "";
  return stripMarkdownCodeBlocks(rawOutput);
}

/**
 * Task function with documentation content
 */
export async function taskWithDocs(input: TaskInput, hooks?: any): Promise<string> {
  console.log(`[WithDocs] Generating code with ${GENERATION_MODEL}...`);

  if (!input.docLink) {
    // Fall back to baseline if no docLink provided
    return taskBaseline(input, hooks);
  }

  const docResult = await fetchDocumentationWithInfo(input.docLink);

  const enhancedPrompt = `${input.prompt}

Use the following MongoDB documentation as reference:

${docResult.content}`;

  if (hooks) {
    hooks.metadata.actualPrompt = enhancedPrompt;
    hooks.metadata.docContentLength = docResult.content.length;
    hooks.metadata.docOriginalLength = docResult.originalLength;
    hooks.metadata.docWasTruncated = docResult.wasTruncated;
    hooks.metadata.docCharsTruncated = docResult.charsTruncated;
    hooks.metadata.docUrl = docResult.url;
    hooks.metadata.generationModel = GENERATION_MODEL;

    // Flag for easy filtering in Braintrust when docs were truncated
    if (docResult.wasTruncated) {
      hooks.metadata.docsTruncationWarning = `Documentation from ${docResult.url} was truncated: ${docResult.originalLength} -> ${docResult.content.length} chars (${docResult.charsTruncated} chars removed). Consider splitting or summarizing this docs page.`;
    }
  }

  const response = await generationClient.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: "system", content: BASELINE_SYSTEM_PROMPT },
      { role: "user", content: enhancedPrompt }
    ],
    temperature: 0.2,
  });
  const rawOutput = response.choices[0]?.message?.content || "";
  return stripMarkdownCodeBlocks(rawOutput);
}

/**
 * Task function with skill/expertise from a file
 */
export async function taskWithSkill(input: TaskInput, hooks?: any): Promise<string> {
  console.log(`[WithSkill] Generating code with ${GENERATION_MODEL}...`);

  if (!input.skillFiles) {
    throw new Error("skillFiles is required for taskWithSkill");
  }
  const skillContent = await readSkillFiles(input.skillFiles);

  const systemPrompt = `You are a MongoDB expert assistant. Generate Node.js code using the MongoDB driver.

Requirements:
- Use CommonJS syntax (require, not import)
- Use async/await
- Include error handling
- Get the MongoDB connection string from the MONGODB_URI environment variable (process.env.MONGODB_URI)
- Do NOT hardcode connection strings like "mongodb://localhost:27017"
- Return only executable code
- Do NOT wrap code in markdown code blocks or backticks
- No explanations or comments outside the code

${skillContent}`;

  if (hooks) {
    hooks.metadata.skillFiles = input.skillFiles;
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
  const rawOutput = response.choices[0]?.message?.content || "";
  return stripMarkdownCodeBlocks(rawOutput);
}

// =============================================================================
// EVALUATION RUNNER
// =============================================================================

/**
 * Convert an EvalCase to the format expected by Braintrust.
 */
function evalCaseToData(evalCase: EvalCase): { input: TaskInput; expected: EvalCaseExpected } {
  return {
    input: {
      prompt: evalCase.input.prompt,
      docLink: evalCase.input.docLink,
      skillFiles: evalCase.input.skillFiles,
    },
    expected: evalCase.expected,
  };
}

/**
 * Create a scorer function that runs all scorers and returns all scores.
 *
 * This function:
 * 1. Executes the code (if execution assertions are specified)
 * 2. Runs all scorers with the execution result
 * 3. Aggregates scores into categories and compound
 * 4. Returns all scores for Braintrust
 */
function createEvalScorer(_evalCase: EvalCase) {
  return async function scorer(args: {
    input: TaskInput;
    output: string;
    expected: EvalCaseExpected;
  }): Promise<ScoreResult[]> {
    const { output, expected } = args;

    // Execute code if execution or result assertions are specified
    let executionResult: ScorerContext["executionResult"];
    if (expected.execution?.shouldSucceed || expected.result) {
      try {
        executionResult = await executeMongoDBCode(output);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        executionResult = { success: false, error: message };
      }
    }

    // Build scorer context
    const context: ScorerContext = {
      output,
      expected,
      executionResult,
    };

    // Run all scorers
    const scorerResults: Array<ScoreResult | ScoreResult[]> = [];
    for (const scorer of allScorers) {
      const result = await scorer(context);
      scorerResults.push(result);
    }

    // Flatten results (some scorers return arrays)
    const flatScores = flattenScores(scorerResults);

    // Aggregate into categories and compound
    const aggregated = aggregateScores(flatScores);

    // Return all scores: individual + categories + compound
    return [
      ...aggregated.individual,
      ...aggregated.categories,
      aggregated.compound,
    ];
  };
}

/**
 * Run a complete evaluation comparing all three approaches.
 * Executes sequentially with cleanup between each to avoid resource conflicts.
 */
export async function runEvaluation(config: EvaluationConfig): Promise<void> {
  const { projectName, evalCases } = config;

  console.log(`\nRunning Evaluation: ${projectName}\n`);
  console.log("Results will be logged to the Braintrust dashboard.");
  console.log("View your experiments at: https://www.braintrust.dev\n");
  console.log(`Model Configuration:`);
  console.log(`   Generation: ${GENERATION_MODEL}`);
  console.log(`   Scoring:    ${SCORING_MODEL}\n`);

  // Convert eval cases to Braintrust data format
  const evalData = evalCases.map(evalCaseToData);

  // Create cleanup function for all eval cases
  const cleanupAll = async () => {
    for (const evalCase of evalCases) {
      await runCleanup(evalCase.cleanup);
    }
  };

  // Initial cleanup
  console.log("Running initial cleanup...\n");
  await cleanupAll();

  // Create scorers for each eval case
  // Note: Braintrust expects a single scorer, but we return an array of scores
  const scorers = evalCases.map((evalCase) => createEvalScorer(evalCase));

  console.log("--- Evaluation 1: Baseline ---");
  await Eval(projectName, {
    experimentName: "Baseline",
    update: true,
    data: () => evalData,
    task: async (input: TaskInput, hooks) => taskBaseline(input, hooks),
    scores: scorers,
  });

  await cleanupAll();

  console.log("\n--- Evaluation 2: With Documentation ---");
  await Eval(projectName, {
    experimentName: "With Docs",
    update: true,
    data: () => evalData,
    task: async (input: TaskInput, hooks) => taskWithDocs(input, hooks),
    scores: scorers,
  });

  await cleanupAll();

  console.log("\n--- Evaluation 3: With Skill ---");
  await Eval(projectName, {
    experimentName: "With Skill",
    update: true,
    data: () => evalData,
    task: async (input: TaskInput, hooks) => taskWithSkill(input, hooks),
    scores: scorers,
  });

  // Final cleanup
  await cleanupAll();

  console.log("\nAll evaluations complete!");
}
