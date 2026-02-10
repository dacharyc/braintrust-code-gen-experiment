/**
 * MongoDB Code Generation Evaluation
 *
 * Compares three approaches for LLM code generation:
 * 1. Baseline: LLM with realistic developer prompt (no extra help)
 * 2. With Documentation: Same prompt + actual documentation content fetched from URL
 * 3. With Skill: Same prompt + custom MongoDB expertise in system prompt
 *
 * Usage: npm run compare
 *
 * Results are logged to Braintrust dashboard for tracking experiments over time.
 *
 * Model Configuration:
 * - Uses Braintrust AI Proxy for unified access to multiple LLM providers
 * - Generation and scoring use different models to avoid bias
 * - Change GENERATION_MODEL and SCORING_MODEL to test different models
 */

import { Eval } from "braintrust";
import OpenAI from "openai";
import { fetchDocumentation } from "./utils/fetch-documentation.js";
import { readSkillFile } from "./utils/read-skill-file.js";
import { scoreMongoDBCode } from "./scorers/mongodb-code-scorer.js";
import { cleanupSearchIndexes } from "./utils/code-executor.js";

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================
// Using Braintrust AI Proxy allows switching between providers easily.
// Just change the model name - no code changes needed.
//
// Supported models include:
// - OpenAI: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
// - Anthropic: claude-sonnet-4-5-20250929, claude-3-5-sonnet-20241022, claude-3-opus-20240229
// - Google: gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-pro
// - And many more via Together, Fireworks, etc.
// =============================================================================

/** Model used for code generation tasks */
const GENERATION_MODEL = process.env.GENERATION_MODEL || "gpt-4o-mini";

/** Model used for LLM-based scoring (different from generation to avoid bias) */
const SCORING_MODEL = process.env.SCORING_MODEL || "claude-sonnet-4-5-20250929";

// =============================================================================
// BRAINTRUST AI PROXY CLIENTS
// =============================================================================
// We create separate clients for generation and scoring to:
// 1. Use different models (avoiding self-evaluation bias)
// 2. Allow independent configuration (e.g., different temperatures)
// 3. Make it clear in logs which client is being used
// =============================================================================

/**
 * OpenAI client configured to use Braintrust AI Proxy for code generation.
 * Uses BRAINTRUST_API_KEY for authentication.
 */
const generationClient = new OpenAI({
  baseURL: "https://api.braintrust.dev/v1/proxy",
  apiKey: process.env.BRAINTRUST_API_KEY,
});

/**
 * OpenAI client configured to use Braintrust AI Proxy for scoring.
 * Uses a different model than generation to avoid bias in LLM-as-judge scenarios.
 */
export const scoringClient = new OpenAI({
  baseURL: "https://api.braintrust.dev/v1/proxy",
  apiKey: process.env.BRAINTRUST_API_KEY,
});

/** Export scoring model for use in scorer */
export { SCORING_MODEL };

// Evaluation data: test cases for MongoDB code generation
// Note: Braintrust passes `input` to the task function, so we structure input as an object
// containing all the data the task needs (prompt, docLink, etc.)
const evalData: any[] = [
  {
    input: {
      prompt: "Write Node.js code to create a search index on the movies collection in sample_mflix with dynamic mapping",
      docLink: "https://www.mongodb.com/docs/atlas/atlas-search/manage-indexes.md",
      skillFile: "src/skills/search.md",
    },
    expected: {
      type: "createSearchIndex",
      database: "sample_mflix",
      collection: "movies",
      indexName: "default",
      hasDynamicMapping: true,
    },
  },
];

const BASELINE_SYSTEM_PROMPT = `You are a helpful coding assistant. Generate Node.js code using the MongoDB driver.

Requirements:
- Use CommonJS syntax (require, not import)
- Use async/await
- Include error handling
- Return only executable code
- Do NOT wrap code in markdown code blocks or backticks
- No explanations or comments outside the code`;

// Input type for task functions
interface TaskInput {
  prompt: string;
  docLink: string;
  skillFile?: string;
}

/**
 * Task function for baseline approach (no extra help)
 */
async function taskBaseline(input: TaskInput, hooks?: any): Promise<string> {
  console.log(`[Baseline] Generating code with ${GENERATION_MODEL}...`);

  // Log model info to metadata
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
 * Fetches the actual documentation and includes it in the prompt
 * @param hooks - Braintrust hooks for logging additional data to the span
 */
async function taskWithDocs(input: TaskInput, hooks?: any): Promise<string> {
  console.log(`[WithDocs] Generating code with ${GENERATION_MODEL}...`);

  // Fetch actual documentation content
  const docContent = await fetchDocumentation(input.docLink);

  const enhancedPrompt = `${input.prompt}

Use the following MongoDB documentation as reference:

${docContent}`;

  // Log the actual prompt with documentation to Braintrust metadata
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
 * Task function with MongoDB skill/expertise
 * Reads skill content from a file and uses it as the system prompt
 * @param hooks - Braintrust hooks for logging additional data
 */
async function taskWithSkill(input: TaskInput, hooks?: any): Promise<string> {
  console.log(`[WithSkill] Generating code with ${GENERATION_MODEL}...`);

  // Read skill content from file
  if (!input.skillFile) {
    throw new Error("skillFile is required for taskWithSkill");
  }
  const skillContent = await readSkillFile(input.skillFile);

  // Build system prompt with skill content
  const systemPrompt = `You are a MongoDB expert assistant. Generate Node.js code using the MongoDB driver.

${skillContent}`;

  // Log the skill prompt and user prompt separately to metadata
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

// Export for use in index.ts
// Runs all three evaluations sequentially to avoid MongoDB index cleanup race conditions
export async function compareApproaches() {
  console.log("\n🚀 Running MongoDB Code Generation Evaluation with Braintrust\n");
  console.log("Results will be logged to the Braintrust dashboard.");
  console.log("View your experiments at: https://www.braintrust.dev\n");
  console.log(`📊 Model Configuration:`);
  console.log(`   Generation: ${GENERATION_MODEL}`);
  console.log(`   Scoring:    ${SCORING_MODEL}\n`);

  // Run evaluations sequentially by awaiting each Eval() call
  // This ensures MongoDB index cleanup completes before the next evaluation starts

  const PROJECT_NAME = "MongoDB Atlas Search";

  // Initial cleanup to ensure clean state before any evaluations
  console.log("🧹 Cleaning up any existing search indexes...\n");
  await cleanupSearchIndexes();

  console.log("--- Evaluation 1: Baseline ---");
  await Eval(PROJECT_NAME, {
    experimentName: "Baseline",
    update: true, // Continue logging to existing experiment if it exists
    data: () => evalData,
    task: async (input: TaskInput, hooks) => {
      return await taskBaseline(input, hooks);
    },
    scores: [scoreMongoDBCode],
  });

  // Cleanup after Baseline before running With Docs
  await cleanupSearchIndexes();

  console.log("\n--- Evaluation 2: With Documentation ---");
  await Eval(PROJECT_NAME, {
    experimentName: "With Docs",
    update: true, // Continue logging to existing experiment if it exists
    data: () => evalData,
    task: async (input: TaskInput, hooks) => {
      return await taskWithDocs(input, hooks);
    },
    scores: [scoreMongoDBCode],
  });

  // Cleanup after With Docs before running With Skill
  await cleanupSearchIndexes();

  console.log("\n--- Evaluation 3: With Skill ---");
  await Eval(PROJECT_NAME, {
    experimentName: "With Skill",
    update: true, // Continue logging to existing experiment if it exists
    data: () => evalData,
    task: async (input: TaskInput, hooks) => {
      return await taskWithSkill(input, hooks);
    },
    scores: [scoreMongoDBCode],
  });

  // Final cleanup to leave the database in a clean state
  await cleanupSearchIndexes();

  console.log("\n✅ All evaluations complete!");
}

// Run when executed directly (not when imported)
// This allows the script to work with both `braintrust eval` and direct execution
compareApproaches().catch(console.error);
