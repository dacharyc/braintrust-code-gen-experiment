/**
 * Syntax scorer: IsValidJS
 *
 * Validates that the generated code is syntactically valid JavaScript.
 * Uses acorn for lightweight parsing.
 */

import * as acorn from "acorn";
import type { CodeGenScorer, ScoreResult } from "../types.js";

/**
 * Checks if the generated code is valid JavaScript syntax.
 *
 * Returns:
 * - score: 1 if code parses successfully
 * - score: 0 if code has syntax errors
 * - score: null if isValidJS assertion is not specified
 */
export const isValidJS: CodeGenScorer = async (context): Promise<ScoreResult> => {
  const { output, expected } = context;

  // Check if this assertion applies
  if (expected.syntax?.isValidJS !== true) {
    return { name: "Syntax_IsValidJS", score: null };
  }

  try {
    // Parse the code with acorn
    // Using latest ECMAScript version and module source type for modern JS
    acorn.parse(output, {
      ecmaVersion: "latest",
      sourceType: "module",
      // Allow top-level await
      allowAwaitOutsideFunction: true,
    });

    return {
      name: "Syntax_IsValidJS",
      score: 1,
      metadata: { parsed: true },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      name: "Syntax_IsValidJS",
      score: 0,
      metadata: {
        parsed: false,
        error: errorMessage,
        // Include preview of output to help debug in Braintrust
        outputPreview: output.slice(0, 200),
      },
    };
  }
};

