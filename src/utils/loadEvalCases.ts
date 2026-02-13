/**
 * YAML eval case loader.
 *
 * Loads and validates eval cases from YAML files.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { parse as parseYaml } from "yaml";
import { EvalCasesSchema, type EvalCase } from "../schemas/evalCase.js";

/**
 * Load eval cases from a single YAML file.
 *
 * @param filePath - Path to the YAML file
 * @returns Array of validated eval cases
 * @throws Error if file cannot be read or validation fails
 */
export function loadEvalCasesFromFile(filePath: string): EvalCase[] {
  const content = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(content);

  // Validate with Zod schema
  const result = EvalCasesSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  - ${String(e.path.join("."))}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid eval case file ${filePath}:\n${errors}`);
  }

  return result.data;
}

/**
 * Load all eval cases from a directory (recursively).
 *
 * @param dirPath - Path to the directory containing YAML files
 * @returns Array of all validated eval cases
 */
export function loadEvalCasesFromDirectory(dirPath: string): EvalCase[] {
  const evalCases: EvalCase[] = [];

  function walkDir(dir: string): void {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (stat.isFile() && [".yml", ".yaml"].includes(extname(entry))) {
        const cases = loadEvalCasesFromFile(fullPath);
        evalCases.push(...cases);
      }
    }
  }

  walkDir(dirPath);
  return evalCases;
}

/**
 * Filter eval cases by tags.
 *
 * @param evalCases - Array of eval cases
 * @param tags - Tags to filter by (case matches if it has ANY of these tags)
 * @returns Filtered array of eval cases
 */
export function filterByTags(evalCases: EvalCase[], tags: string[]): EvalCase[] {
  if (tags.length === 0) return evalCases;

  return evalCases.filter((evalCase) => {
    if (!evalCase.tags) return false;
    return tags.some((tag) => evalCase.tags!.includes(tag));
  });
}

