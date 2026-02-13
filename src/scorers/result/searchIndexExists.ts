/**
 * Result scorer: SearchIndexExists
 *
 * Validates that a search index was created with the expected configuration.
 * Connects to MongoDB to verify the index exists.
 */

import { MongoClient } from "mongodb";
import type { CodeGenScorer, ScoreResult } from "../types.js";

/**
 * Checks if a search index exists with the expected configuration.
 *
 * Returns an array of ScoreResults:
 * - Result_SearchIndexExists: 1 if index exists, 0 if not
 * - Result_SearchIndexConfig_<key>: 1 if config matches, 0 if not (for each config key)
 *
 * Returns a single result with score: null if searchIndexExists assertion is not specified.
 */
export const searchIndexExists: CodeGenScorer = async (context): Promise<ScoreResult | ScoreResult[]> => {
  const { expected, executionResult } = context;
  const indexConfig = expected.result?.searchIndexExists;

  // Check if this assertion applies
  if (!indexConfig) {
    return { name: "Result_SearchIndexExists", score: null };
  }

  // If execution didn't succeed, we can't verify the result
  if (!executionResult?.success) {
    return {
      name: "Result_SearchIndexExists",
      score: 0,
      metadata: {
        reason: "Cannot verify index - code execution failed",
      },
    };
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return {
      name: "Result_SearchIndexExists",
      score: 0,
      metadata: {
        error: "MONGODB_URI environment variable not set",
      },
    };
  }

  const { database, collection, indexName, config } = indexConfig;
  const results: ScoreResult[] = [];
  let client: MongoClient | null = null;

  try {
    client = new MongoClient(uri);
    await client.connect();

    const db = client.db(database);
    const coll = db.collection(collection);

    // List search indexes
    const indexes = await coll.listSearchIndexes().toArray();
    const foundIndex = indexes.find((idx) => idx.name === indexName);

    if (!foundIndex) {
      results.push({
        name: "Result_SearchIndexExists",
        score: 0,
        metadata: {
          reason: `Index "${indexName}" not found`,
          availableIndexes: indexes.map((idx) => idx.name),
        },
      });
      return results;
    }

    // Index exists
    results.push({
      name: "Result_SearchIndexExists",
      score: 1,
      metadata: {
        indexName: foundIndex.name,
        // Status may not be present on all index types
        status: (foundIndex as Record<string, unknown>).status,
      },
    });

    // Check config if specified
    if (config) {
      for (const [key, expectedValue] of Object.entries(config)) {
        const actualValue = getNestedValue(foundIndex, key);
        const matches = JSON.stringify(actualValue) === JSON.stringify(expectedValue);

        results.push({
          name: `Result_SearchIndexConfig_${key.replace(/\./g, "_")}`,
          score: matches ? 1 : 0,
          metadata: {
            key,
            expected: expectedValue,
            actual: actualValue,
          },
        });
      }
    }

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      name: "Result_SearchIndexExists",
      score: 0,
      metadata: { error: errorMessage },
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};

/**
 * Get a nested value from an object using dot notation.
 * e.g., getNestedValue(obj, "mappings.dynamic") returns obj.mappings.dynamic
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, key) => {
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

