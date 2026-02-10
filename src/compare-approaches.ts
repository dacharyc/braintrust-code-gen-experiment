/**
 * MongoDB Atlas Search - Code Generation Evaluation
 *
 * Evaluates LLM effectiveness at generating MongoDB Atlas Search code.
 * Uses the evaluation harness to compare three approaches.
 *
 * Usage: npm run compare
 */

import { runEvaluation, type TaskInput } from "./harness/index.js";
import { scoreMongoDBCode } from "./scorers/mongodb-code-scorer.js";
import { cleanupSearchIndexes } from "./utils/code-executor.js";

// Test cases for MongoDB Atlas Search code generation
const evalData: Array<{ input: TaskInput; expected: any }> = [
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

// Run the evaluation
runEvaluation({
  projectName: "MongoDB Atlas Search",
  evalData,
  scorer: scoreMongoDBCode,
  cleanup: cleanupSearchIndexes,
}).catch(console.error);
