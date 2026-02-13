/**
 * Zod schema for eval case YAML files.
 *
 * Eval cases are declarative YAML files that define:
 * - Input: prompt, docLink, skillFile
 * - Expected assertions: syntax, semantic, execution, result
 * - Cleanup: actions to run after the eval
 */

import { z } from "zod";

// =============================================================================
// PATTERN SCHEMAS
// =============================================================================

/** Pattern with a name for identification in Braintrust */
const PatternSchema = z.object({
  pattern: z.string(),
  name: z.string(),
});

// =============================================================================
// EXPECTED SCHEMAS
// =============================================================================

/** Syntax assertions - validate code structure */
const SyntaxExpectedSchema = z.object({
  isValidJS: z.boolean().optional(),
  hasAsyncAwait: z.boolean().optional(),
}).optional();

/** Semantic assertions - pattern matching in generated code */
const SemanticExpectedSchema = z.object({
  mustContain: z.array(PatternSchema).optional(),
  mustNotContain: z.array(PatternSchema).optional(),
}).optional();

/** Execution assertions - code runs successfully */
const ExecutionExpectedSchema = z.object({
  shouldSucceed: z.boolean().optional(),
}).optional();

/** Search index configuration for result validation */
const SearchIndexConfigSchema = z.record(z.string(), z.unknown()).optional();

/** Search index existence check */
const SearchIndexExistsSchema = z.object({
  database: z.string(),
  collection: z.string(),
  indexName: z.string(),
  config: SearchIndexConfigSchema,
}).optional();

/** Result assertions - verify MongoDB state after execution */
const ResultExpectedSchema = z.object({
  searchIndexExists: SearchIndexExistsSchema,
}).optional();

/** All expected assertions for an eval case */
const ExpectedSchema = z.object({
  syntax: SyntaxExpectedSchema,
  semantic: SemanticExpectedSchema,
  execution: ExecutionExpectedSchema,
  result: ResultExpectedSchema,
});

// =============================================================================
// INPUT SCHEMA
// =============================================================================

/** Input configuration for an eval case */
const InputSchema = z.object({
  prompt: z.string(),
  docLink: z.string().url().optional(),
  /** Single skill file path or array of paths to concatenate */
  skillFiles: z.union([z.string(), z.array(z.string())]).optional(),
});

// =============================================================================
// CLEANUP SCHEMAS
// =============================================================================

/** Drop a search index after the eval */
const DropSearchIndexSchema = z.object({
  database: z.string(),
  collection: z.string(),
  indexName: z.string(),
}).optional();

/** Cleanup actions to run after the eval */
const CleanupSchema = z.object({
  dropSearchIndex: DropSearchIndexSchema,
}).optional();

// =============================================================================
// EVAL CASE SCHEMA
// =============================================================================

/** A single eval case */
export const EvalCaseSchema = z.object({
  name: z.string(),
  tags: z.array(z.string()).optional(),
  input: InputSchema,
  expected: ExpectedSchema,
  cleanup: CleanupSchema,
});

/** Array of eval cases (a YAML file contains an array) */
export const EvalCasesSchema = z.array(EvalCaseSchema);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type EvalCase = z.infer<typeof EvalCaseSchema>;
export type EvalCaseInput = z.infer<typeof InputSchema>;
export type EvalCaseExpected = z.infer<typeof ExpectedSchema>;
export type EvalCaseCleanup = z.infer<typeof CleanupSchema>;
export type Pattern = z.infer<typeof PatternSchema>;

