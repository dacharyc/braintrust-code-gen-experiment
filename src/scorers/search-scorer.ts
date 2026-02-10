import { MongoClient } from "mongodb";
import {
  createScorer,
  type ValidationContext,
  type SemanticValidationResult,
  type ResultValidationResult,
} from "../harness/index.js";

/**
 * Search Scorer - MongoDB Atlas Search code generation
 *
 * Validates generated code for Atlas Search operations:
 * - createSearchIndex: Creating search indexes with proper configuration
 * - searchQuery: Running $search aggregation queries
 *
 * Uses the harness's createScorer for reusable syntax/execution validation.
 */

// =============================================================================
// SEMANTIC VALIDATION
// =============================================================================

/**
 * Validates semantic correctness for Atlas Search operations.
 * Checks for correct API usage based on expected.type.
 */
async function validateSearchSemantics(ctx: ValidationContext): Promise<SemanticValidationResult> {
  const { output, expected, checks, errors } = ctx;
  let score = 0;

  if (expected.type === "createSearchIndex") {
    // Check for createSearchIndex method
    if (output.includes("collection.createSearchIndex(")) {
      score += 0.15;
      checks.push("✓ Uses createSearchIndex method");
    } else {
      errors.push("Missing createSearchIndex method call");
      if (output.includes(".createIndex(")) {
        errors.push("⚠️  Used createIndex() instead of createSearchIndex() - these are different!");
      }
    }

    // Check for correct database and collection
    if (output.includes(expected.database)) {
      score += 0.05;
      checks.push(`✓ References database: ${expected.database}`);
    } else {
      errors.push(`Missing database reference: ${expected.database}`);
    }

    if (output.includes(expected.collection)) {
      score += 0.05;
      checks.push(`✓ References collection: ${expected.collection}`);
    } else {
      errors.push(`Missing collection reference: ${expected.collection}`);
    }

    // Check for index name
    if (output.includes(expected.indexName)) {
      score += 0.05;
      checks.push(`✓ Includes index name: ${expected.indexName}`);
    } else {
      errors.push(`Missing index name: ${expected.indexName}`);
    }

    // Check for correct structure with definition and mappings
    if (output.includes("definition") && output.includes("mappings")) {
      score += 0.05;
      checks.push("✓ Includes correct structure (definition.mappings)");
    } else if (output.includes("mappings")) {
      score += 0.025;
      checks.push("⚠️  Has mappings but may be missing 'definition' wrapper");
    } else {
      errors.push("Missing index definition structure");
    }

    // Check for dynamic mapping if expected
    if (expected.hasDynamicMapping) {
      if (output.includes("dynamic") && output.includes("true")) {
        score += 0.025;
        checks.push("✓ Includes dynamic mapping");
      } else {
        errors.push("Missing dynamic mapping configuration");
      }
    }
  } else if (expected.type === "searchQuery") {
    // Check for $search aggregation stage
    if (output.includes("$search")) {
      score += 0.15;
      checks.push("✓ Uses $search aggregation stage");
    } else {
      errors.push("Missing $search aggregation stage");
    }

    // Check for aggregate method
    if (output.includes("aggregate")) {
      score += 0.05;
      checks.push("✓ Uses aggregate method");
    } else {
      errors.push("Missing aggregate method");
    }

    // Check for search term
    if (expected.searchTerm && output.includes(expected.searchTerm)) {
      score += 0.05;
      checks.push(`✓ Includes search term: ${expected.searchTerm}`);
    }

    // Check for $limit stage
    if (expected.limit && output.includes("$limit")) {
      score += 0.025;
      checks.push("✓ Includes $limit stage");
    }

    // Check for $project stage
    if (expected.projectedFields && output.includes("$project")) {
      score += 0.025;
      checks.push("✓ Includes $project stage");
    }

    // Check for compound query if expected
    if (expected.useCompound) {
      if (output.includes("compound")) {
        score += 0.05;
        checks.push("✓ Uses compound query");
      } else {
        errors.push("Missing compound query structure");
      }
    }
  }

  return { score };
}

// =============================================================================
// RESULT VALIDATION
// =============================================================================

/**
 * Validates the actual result for Atlas Search operations.
 * Verifies that indexes were created with expected configuration.
 */
async function validateSearchResult(
  ctx: ValidationContext & { executionSucceeded: boolean }
): Promise<ResultValidationResult> {
  const { expected, checks, errors, executionSucceeded } = ctx;

  // For createSearchIndex, verify the index was actually created
  if (executionSucceeded && expected.type === "createSearchIndex" && process.env.MONGODB_URI) {
    let client: MongoClient | null = null;
    try {
      client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      const db = client.db(expected.database);
      const collection = db.collection(expected.collection);

      const indexes = await collection.listSearchIndexes().toArray();

      if (indexes.length > 0) {
        const matchingIndex = indexes.find((idx: any) => {
          if (expected.hasDynamicMapping) {
            return idx.latestDefinition?.mappings?.dynamic === true;
          }
          return true;
        });

        if (matchingIndex) {
          checks.push(`✓ Index verified: "${matchingIndex.name}" with expected configuration`);
          return { score: 0.2 };
        } else {
          checks.push("⚠ Index exists but configuration may not match expected");
          return { score: 0.1 };
        }
      } else {
        errors.push("No search indexes found after execution");
        return { score: 0 };
      }
    } catch (error: any) {
      errors.push(`Result verification failed: ${error.message}`);
      checks.push("⚠ Result verification failed, partial credit for structure");
      return { score: 0.1 };
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  // Partial credit if semantic validation passed but no execution
  if (!executionSucceeded) {
    checks.push("⚠ Result validation skipped (execution required)");
    return { score: 0.1 };
  }

  return { score: 0 };
}

// =============================================================================
// EXPORTED SCORER
// =============================================================================

/**
 * Scorer for MongoDB Atlas Search code generation.
 * Use this scorer for evaluating createSearchIndex and searchQuery operations.
 */
export const searchScorer = createScorer({
  name: "search_scorer",
  validateSemantics: validateSearchSemantics,
  validateResult: validateSearchResult,
});

// Legacy export for backwards compatibility
export const scoreMongoDBCode = searchScorer;
