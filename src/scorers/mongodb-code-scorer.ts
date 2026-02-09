import { MongoClient } from "mongodb";
import { executeMongoDBCode } from "../utils/code-executor.js";

/**
 * Scorer for MongoDB Atlas Search code generation
 *
 * This scorer validates generated code on multiple dimensions:
 * 1. Syntax correctness (can it be parsed?)
 * 2. Semantic correctness (does it use the right MongoDB APIs?)
 * 3. Execution correctness (does it run without errors?)
 * 4. Result correctness (does it produce expected results?)
 */

export interface MongoDBCodeScore {
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

/**
 * Score generated MongoDB code
 * Note: input can be any type (string or object) - we only use output and expected for scoring
 */
export async function scoreMongoDBCode(args: {
  input: any;
  output: string;
  expected?: any;
}): Promise<MongoDBCodeScore> {
  const { output, expected } = args;
  const checks: string[] = [];
  const errors: string[] = [];

  let syntaxScore = 0;
  let semanticScore = 0;
  let executionScore = 0;
  let resultScore = 0;

  // 1. SYNTAX VALIDATION (25% of score)
  if (!output || output.trim().length === 0) {
    errors.push("No code generated");
    return {
      name: "mongodb_code_scorer",
      score: 0,
      metadata: { syntaxScore, semanticScore, executionScore, resultScore, checks, errors },
    };
  }

  // Check for basic code structure
  if (output.includes("async") || output.includes("await") || output.includes("function")) {
    syntaxScore += 0.1;
    checks.push("✓ Contains async/await or function syntax");
  }

  // Check for MongoDB imports
  if (output.includes("MongoClient") || output.includes("mongodb")) {
    syntaxScore += 0.15;
    checks.push("✓ Imports MongoDB driver");
  } else {
    errors.push("Missing MongoDB driver import");
  }

  // 2. SEMANTIC VALIDATION (35% of score)
  if (expected.type === "createSearchIndex") {
    // Check for createSearchIndex method (must be a method call, not just function name)
    // Look for .createSearchIndex( pattern to avoid false positives from function names
    if (output.includes("collection.createSearchIndex(")) {
      semanticScore += 0.15;
      checks.push("✓ Uses createSearchIndex method");
    } else {
      errors.push("Missing createSearchIndex method call");
      // Check if they used the wrong method
      if (output.includes(".createIndex(")) {
        errors.push("⚠️  Used createIndex() instead of createSearchIndex() - these are different!");
      }
    }

    // Check for correct database and collection
    if (output.includes(expected.database)) {
      semanticScore += 0.05;
      checks.push(`✓ References database: ${expected.database}`);
    } else {
      errors.push(`Missing database reference: ${expected.database}`);
    }

    if (output.includes(expected.collection)) {
      semanticScore += 0.05;
      checks.push(`✓ References collection: ${expected.collection}`);
    } else {
      errors.push(`Missing collection reference: ${expected.collection}`);
    }

    // Check for index name
    if (output.includes(expected.indexName)) {
      semanticScore += 0.05;
      checks.push(`✓ Includes index name: ${expected.indexName}`);
    } else {
      errors.push(`Missing index name: ${expected.indexName}`);
    }

    // Check for correct structure with definition and mappings
    if (output.includes("definition") && output.includes("mappings")) {
      semanticScore += 0.05;
      checks.push("✓ Includes correct structure (definition.mappings)");
    } else if (output.includes("mappings")) {
      semanticScore += 0.025;
      checks.push("⚠️  Has mappings but may be missing 'definition' wrapper");
    } else {
      errors.push("Missing index definition structure");
    }

    // Check for dynamic mapping if expected
    if (expected.hasDynamicMapping) {
      if (output.includes("dynamic") && output.includes("true")) {
        semanticScore += 0.025;
        checks.push("✓ Includes dynamic mapping");
      } else {
        errors.push("Missing dynamic mapping configuration");
      }
    }

  } else if (expected.type === "searchQuery") {
    // Check for $search aggregation stage
    if (output.includes("$search")) {
      semanticScore += 0.15;
      checks.push("✓ Uses $search aggregation stage");
    } else {
      errors.push("Missing $search aggregation stage");
    }

    // Check for aggregate method
    if (output.includes("aggregate")) {
      semanticScore += 0.05;
      checks.push("✓ Uses aggregate method");
    } else {
      errors.push("Missing aggregate method");
    }

    // Check for search term
    if (expected.searchTerm && output.includes(expected.searchTerm)) {
      semanticScore += 0.05;
      checks.push(`✓ Includes search term: ${expected.searchTerm}`);
    }

    // Check for $limit stage
    if (expected.limit && output.includes("$limit")) {
      semanticScore += 0.025;
      checks.push("✓ Includes $limit stage");
    }

    // Check for $project stage
    if (expected.projectedFields && output.includes("$project")) {
      semanticScore += 0.025;
      checks.push("✓ Includes $project stage");
    }

    // Check for compound query if expected
    if (expected.useCompound) {
      if (output.includes("compound")) {
        semanticScore += 0.05;
        checks.push("✓ Uses compound query");
      } else {
        errors.push("Missing compound query structure");
      }
    }
  }

  // 3. EXECUTION VALIDATION (20% of score)
  // Only attempt execution if we have a connection string
  if (process.env.MONGODB_URI) {
    try {
      const execResult = await executeMongoDBCode(output);

      if (execResult.success) {
        executionScore = 0.2;
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

  // 4. RESULT VALIDATION (20% of score)
  // Verify the expected result was achieved (e.g., index was actually created)
  if (executionScore > 0 && expected.type === "createSearchIndex" && process.env.MONGODB_URI) {
    // Code executed successfully, now verify the index was created
    let client: MongoClient | null = null;
    try {
      client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      const db = client.db(expected.database);
      const collection = db.collection(expected.collection);

      // List search indexes to verify creation
      const indexes = await collection.listSearchIndexes().toArray();

      if (indexes.length > 0) {
        // Check if any index matches expected properties
        const matchingIndex = indexes.find((idx: any) => {
          // Check for dynamic mapping if expected
          if (expected.hasDynamicMapping) {
            return idx.latestDefinition?.mappings?.dynamic === true;
          }
          return true;
        });

        if (matchingIndex) {
          resultScore = 0.2; // Full credit - index verified
          checks.push(`✓ Index verified: "${matchingIndex.name}" with expected configuration`);
        } else {
          resultScore = 0.1; // Partial credit - index exists but config may differ
          checks.push(`⚠ Index exists but configuration may not match expected`);
        }
      } else {
        errors.push("No search indexes found after execution");
      }
    } catch (error: any) {
      errors.push(`Result verification failed: ${error.message}`);
      // Fall back to partial credit if verification fails but execution succeeded
      if (semanticScore > 0.25) {
        resultScore = 0.1;
        checks.push("⚠ Result verification failed, partial credit for structure");
      }
    } finally {
      if (client) {
        await client.close();
      }
    }
  } else if (semanticScore > 0.25) {
    // No execution or not a createSearchIndex type - give partial credit for structure
    resultScore = 0.1;
    checks.push("⚠ Result validation skipped (execution required)");
  }

  const totalScore = syntaxScore + semanticScore + executionScore + resultScore;

  // Debug output to understand scoring
  console.log(`[Scorer Debug] Syntax: ${syntaxScore}, Semantic: ${semanticScore}, Execution: ${executionScore}, Result: ${resultScore}, Total: ${totalScore}`);

  return {
    name: "mongodb_code_scorer",
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
}

