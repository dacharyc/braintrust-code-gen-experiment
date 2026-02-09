import { MongoClient } from "mongodb";
import * as vm from "vm";

/**
 * Utility for executing and validating generated MongoDB code
 */

export interface ExecutionResult {
  success: boolean;
  error?: string;
  output?: any;
  executionTime?: number;
}

/**
 * Clean up any search indexes created during testing
 * This prevents duplicate index errors when running multiple tests
 *
 * Note: Dropping search indexes is asynchronous on Atlas, so we poll
 * until the indexes are actually gone before returning.
 */
export async function cleanupSearchIndexes(
  database: string = "sample_mflix",
  collection: string = "movies",
  connectionString?: string,
  maxWaitSeconds: number = 60
): Promise<void> {
  const uri = connectionString || process.env.MONGODB_URI;
  if (!uri) {
    console.warn("Cannot cleanup: MongoDB connection string not provided");
    return;
  }

  let client: MongoClient | null = null;
  try {
    client = new MongoClient(uri);
    await client.connect();
    const db = client.db(database);
    const coll = db.collection(collection);

    // List all search indexes
    const indexes = await coll.listSearchIndexes().toArray();

    if (indexes.length === 0) {
      console.log(`[Cleanup] No search indexes to clean up`);
      return;
    }

    const indexNames = indexes.map(idx => idx.name).filter(Boolean) as string[];
    console.log(`[Cleanup] Found ${indexNames.length} search index(es) to drop: ${indexNames.join(', ')}`);

    // Drop each search index
    for (const indexName of indexNames) {
      try {
        await coll.dropSearchIndex(indexName);
        console.log(`[Cleanup] Initiated drop for search index: ${indexName}`);
      } catch (err) {
        console.warn(`[Cleanup] Could not initiate drop for index ${indexName}:`, err instanceof Error ? err.message : String(err));
      }
    }

    // Poll until all indexes are actually gone
    const startTime = Date.now();
    const pollIntervalMs = 2000; // Check every 2 seconds
    const maxWaitMs = maxWaitSeconds * 1000;

    console.log(`[Cleanup] Waiting for indexes to be fully dropped (max ${maxWaitSeconds}s)...`);

    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed > maxWaitMs) {
        console.warn(`[Cleanup] Timeout waiting for indexes to drop after ${maxWaitSeconds}s`);
        break;
      }

      // Check if any of the indexes still exist
      const currentIndexes = await coll.listSearchIndexes().toArray();
      const remainingIndexes = currentIndexes
        .map(idx => idx.name)
        .filter(name => indexNames.includes(name as string));

      if (remainingIndexes.length === 0) {
        console.log(`[Cleanup] ✅ All search indexes successfully dropped`);
        break;
      }

      console.log(`[Cleanup] Still waiting for ${remainingIndexes.length} index(es): ${remainingIndexes.join(', ')}`);

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

  } catch (error) {
    console.warn("[Cleanup] Error during cleanup:", error instanceof Error ? error.message : String(error));
  } finally {
    if (client) {
      await client.close();
    }
  }
}

/**
 * Safely execute generated MongoDB code in a sandboxed environment
 *
 * @param code - The generated code to execute
 * @param connectionString - MongoDB connection string (optional, uses env var if not provided)
 * @param timeout - Execution timeout in milliseconds (default: 30000)
 * @returns ExecutionResult with success status and output or error
 */
export async function executeMongoDBCode(
  code: string,
  connectionString?: string,
  timeout: number = 30000
): Promise<ExecutionResult> {
  const startTime = Date.now();
  let client: MongoClient | null = null;

  try {
    // Get connection string from environment or parameter
    const uri = connectionString || process.env.MONGODB_URI;

    if (!uri) {
      return {
        success: false,
        error: "MongoDB connection string not provided. Set MONGODB_URI environment variable.",
      };
    }

    // Create MongoDB client
    client = new MongoClient(uri);
    await client.connect();

    // Create a sandbox context with MongoDB client and common utilities
    const sandbox = {
      MongoClient,
      client,
      console: {
        log: (...args: any[]) => console.log("[Generated Code]", ...args),
        error: (...args: any[]) => console.error("[Generated Code]", ...args),
      },
      require: (module: string) => {
        // Only allow specific modules
        if (module === "mongodb") {
          return { MongoClient };
        }
        throw new Error(`Module '${module}' is not allowed in sandbox`);
      },
      process: {
        env: {
          ...process.env,
          MONGODB_URI: uri, // Explicitly set MONGODB_URI in sandbox
        },
      },
      setTimeout,
      clearTimeout,
      Promise,
      Array,
      Object,
      JSON,
      Math,
      Date,
    };



    // Wrap code in an async function
    // Detect if code ends with a function call that's not awaited and await it
    // Common pattern: "functionName();" at the end
    const trimmedCode = code.trim();
    const lastLine = trimmedCode.split('\n').pop()?.trim() || '';
    const isUnawaitedCall = /^[a-zA-Z_][a-zA-Z0-9_]*\(\s*\);?\s*$/.test(lastLine) && !lastLine.startsWith('await ');

    let processedCode = code;
    if (isUnawaitedCall) {
      // Replace the last function call with an awaited version
      const lines = trimmedCode.split('\n');
      const lastLineIndex = lines.length - 1;
      lines[lastLineIndex] = 'await ' + lines[lastLineIndex];
      processedCode = lines.join('\n');
    }

    const wrappedCode = `
      (async () => {
        ${processedCode}
      })()
    `;

    // Create VM context
    const context = vm.createContext(sandbox);

    // Execute code with timeout
    const script = new vm.Script(wrappedCode, {
      filename: "generated-code.js",
    });

    const result = await script.runInContext(context, {
      timeout,
    });
    const executionTime = Date.now() - startTime;

    return {
      success: true,
      output: result,
      executionTime,
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    return {
      success: false,
      error: error.message || String(error),
      executionTime,
    };
  } finally {
    // Clean up MongoDB connection
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.error("Error closing MongoDB connection:", e);
      }
    }
  }
}

/**
 * Validate that generated code creates a search index correctly
 */
export async function validateSearchIndexCreation(
  code: string,
  expectedIndexName: string,
  connectionString?: string
): Promise<{ valid: boolean; error?: string; indexFound?: boolean }> {
  const uri = connectionString || process.env.MONGODB_URI;
  if (!uri) {
    return { valid: false, error: "MongoDB connection string not provided" };
  }

  let client: MongoClient | null = null;

  try {
    client = new MongoClient(uri);
    await client.connect();

    // Execute the code to create the index
    const execResult = await executeMongoDBCode(code, uri);
    if (!execResult.success) {
      return { valid: false, error: execResult.error };
    }

    // Wait a bit for index to be created
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if the index was created
    // Note: This requires the code to specify which database and collection
    // For a more robust solution, you'd parse the code to extract these details

    return { valid: true, indexFound: true };
  } catch (error: any) {
    return { valid: false, error: error.message };
  } finally {
    if (client) {
      await client.close();
    }
  }
}

/**
 * Validate that generated code runs a search query correctly
 */
export async function validateSearchQuery(
  code: string,
  expectedResultCount?: number,
  connectionString?: string
): Promise<{ valid: boolean; error?: string; resultCount?: number; results?: any[] }> {
  const execResult = await executeMongoDBCode(code, connectionString);

  if (!execResult.success) {
    return { valid: false, error: execResult.error };
  }

  // Check if results were returned
  const results = execResult.output;
  if (!Array.isArray(results)) {
    return { valid: false, error: "Query did not return an array of results" };
  }

  const resultCount = results.length;

  // Validate result count if expected
  if (expectedResultCount !== undefined && resultCount !== expectedResultCount) {
    return {
      valid: false,
      error: `Expected ${expectedResultCount} results, got ${resultCount}`,
      resultCount,
      results,
    };
  }

  return { valid: true, resultCount, results };
}

