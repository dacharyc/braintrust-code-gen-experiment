/**
 * Utility for reading skill content from local files
 */

import { readFile } from "fs/promises";
import { resolve } from "path";

export interface ReadSkillFileOptions {
  /** Base directory for resolving relative paths (default: process.cwd()) */
  baseDir?: string;
  /** Whether to log progress to console (default: true) */
  verbose?: boolean;
}

/**
 * Read skill content from a local file
 *
 * @param filePath - Path to the skill file (relative or absolute)
 * @param options - Optional configuration
 * @returns The skill file content
 */
export async function readSkillFile(
  filePath: string,
  options: ReadSkillFileOptions = {}
): Promise<string> {
  const { baseDir = process.cwd(), verbose = true } = options;

  try {
    const resolvedPath = resolve(baseDir, filePath);

    if (verbose) {
      console.log(`[Skill] Reading skill file: ${resolvedPath}`);
    }

    const content = await readFile(resolvedPath, "utf-8");

    if (verbose) {
      console.log(`[Skill] Loaded ${content.length} characters from skill file`);
    }

    return content;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (verbose) {
      console.warn(`[Skill] Error reading skill file:`, errorMessage);
    }

    return `[Skill file could not be loaded from ${filePath}]`;
  }
}

/**
 * Read and concatenate multiple skill files
 *
 * @param filePaths - Single path or array of paths to skill files
 * @param options - Optional configuration
 * @returns Concatenated skill file content (separated by double newlines)
 */
export async function readSkillFiles(
  filePaths: string | string[],
  options: ReadSkillFileOptions = {}
): Promise<string> {
  const { verbose = true } = options;
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

  const contents = await Promise.all(
    paths.map(path => readSkillFile(path, { ...options, verbose: false }))
  );

  const combined = contents.join('\n\n');

  if (verbose) {
    console.log(`[Skill] Loaded ${paths.length} skill file(s), total ${combined.length} characters`);
  }

  return combined;
}

