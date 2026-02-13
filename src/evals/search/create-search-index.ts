/**
 * MongoDB Atlas Search - Code Generation Evaluation
 *
 * Evaluates LLM effectiveness at generating MongoDB Atlas Search code.
 * Uses the evaluation harness to compare three approaches.
 *
 * Usage: npm run compare
 */

import { runEvaluation } from "../../harness/index.js";
import { loadEvalCasesFromFile } from "../../utils/loadEvalCases.js";

// Load eval cases from YAML
const evalCases = loadEvalCasesFromFile("evalCases/search/index-creation.yml");

console.log(`Loaded ${evalCases.length} eval case(s)`);

// Run the evaluation
runEvaluation({
  projectName: "Code Gen Experiment",
  evalCases,
}).catch(console.error);
