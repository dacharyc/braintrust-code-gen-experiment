/**
 * Cleanup utilities for eval cases.
 *
 * Runs cleanup actions defined in eval case YAML files.
 */

import { MongoClient } from "mongodb";
import type { EvalCaseCleanup } from "../schemas/evalCase.js";

/**
 * Run cleanup actions for an eval case.
 *
 * @param cleanup - Cleanup configuration from the eval case
 * @param maxWaitSeconds - Maximum time to wait for async operations (default: 60)
 */
export async function runCleanup(
  cleanup: EvalCaseCleanup | undefined,
  maxWaitSeconds: number = 60
): Promise<void> {
  if (!cleanup) return;

  if (cleanup.dropSearchIndex) {
    await dropSearchIndex(
      cleanup.dropSearchIndex.database,
      cleanup.dropSearchIndex.collection,
      cleanup.dropSearchIndex.indexName,
      maxWaitSeconds
    );
  }
}

/**
 * Drop a search index and wait for it to be fully removed.
 *
 * Note: Dropping search indexes is asynchronous on Atlas, so we poll
 * until the index is actually gone before returning.
 */
export async function dropSearchIndex(
  database: string,
  collection: string,
  indexName: string,
  maxWaitSeconds: number = 60
): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[Cleanup] Cannot cleanup: MONGODB_URI not set");
    return;
  }

  let client: MongoClient | null = null;

  try {
    client = new MongoClient(uri);
    await client.connect();

    const db = client.db(database);
    const coll = db.collection(collection);

    // Check if index exists
    const indexes = await coll.listSearchIndexes().toArray();
    const existingIndex = indexes.find((idx) => idx.name === indexName);

    if (!existingIndex) {
      return; // Index doesn't exist, nothing to clean up
    }

    // Drop the index
    await coll.dropSearchIndex(indexName);

    // Poll until the index is gone
    const startTime = Date.now();
    const maxWaitMs = maxWaitSeconds * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      const currentIndexes = await coll.listSearchIndexes().toArray();
      const stillExists = currentIndexes.some((idx) => idx.name === indexName);

      if (!stillExists) {
        return; // Index is gone
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.warn(
      `[Cleanup] Timeout waiting for index "${indexName}" to be dropped`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Cleanup] Error dropping index: ${message}`);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

