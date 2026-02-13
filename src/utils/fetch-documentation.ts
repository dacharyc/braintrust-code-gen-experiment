/**
 * Utility for fetching documentation content from URLs
 */

/**
 * Default maximum character limit for documentation content.
 * Set to allow large docs while leaving room for system prompts and overhead.
 * 300K characters ≈ 75K tokens (rough estimate: 4 chars/token)
 * This leaves ~50K tokens for prompts, system messages, and model overhead
 * when using a 128K context window model like gpt-4o.
 *
 * Can be overridden via MAX_DOC_CHARS environment variable.
 */
export const DEFAULT_MAX_DOC_CHARS = parseInt(process.env.MAX_DOC_CHARS || "300000", 10);

export interface FetchDocumentationOptions {
  /** Whether to log progress to console (default: true) */
  verbose?: boolean;
  /** Maximum characters to return. Content beyond this is truncated. (default: 300000 or MAX_DOC_CHARS env var) */
  maxChars?: number;
}

/**
 * Result from fetching documentation, including truncation info.
 */
export interface FetchDocumentationResult {
  /** The documentation content (possibly truncated) */
  content: string;
  /** Original length before truncation */
  originalLength: number;
  /** Whether the content was truncated */
  wasTruncated: boolean;
  /** Number of characters truncated (0 if not truncated) */
  charsTruncated: number;
  /** The source URL */
  url: string;
}

/**
 * Fetch documentation content from a URL with optional truncation.
 * Supports .md URLs which return raw markdown.
 *
 * @param url - The URL to fetch documentation from
 * @param options - Optional configuration for fetching
 * @returns FetchDocumentationResult with content and truncation info
 */
export async function fetchDocumentationWithInfo(
  url: string,
  options: FetchDocumentationOptions = {}
): Promise<FetchDocumentationResult> {
  const { verbose = true, maxChars = DEFAULT_MAX_DOC_CHARS } = options;

  try {
    if (verbose) {
      console.log(`[Docs] Fetching documentation from: ${url}`);
    }

    const response = await fetch(url);
    if (!response.ok) {
      if (verbose) {
        console.warn(`[Docs] Failed to fetch: ${response.status} ${response.statusText}`);
      }
      return {
        content: `[Documentation could not be loaded from ${url}]`,
        originalLength: 0,
        wasTruncated: false,
        charsTruncated: 0,
        url,
      };
    }

    const fullContent = await response.text();
    const originalLength = fullContent.length;

    if (verbose) {
      console.log(`[Docs] Fetched ${originalLength} characters of documentation`);
    }

    // Check if truncation is needed
    if (originalLength > maxChars) {
      const truncatedContent = fullContent.slice(0, maxChars);
      const charsTruncated = originalLength - maxChars;

      if (verbose) {
        console.warn(
          `[Docs] Content truncated: ${originalLength} -> ${maxChars} chars (${charsTruncated} chars removed)`
        );
      }

      return {
        content: truncatedContent + `\n\n[... truncated ${charsTruncated} characters ...]`,
        originalLength,
        wasTruncated: true,
        charsTruncated,
        url,
      };
    }

    return {
      content: fullContent,
      originalLength,
      wasTruncated: false,
      charsTruncated: 0,
      url,
    };
  } catch (error) {
    if (verbose) {
      console.warn(
        `[Docs] Error fetching documentation:`,
        error instanceof Error ? error.message : String(error)
      );
    }
    return {
      content: `[Documentation could not be loaded from ${url}]`,
      originalLength: 0,
      wasTruncated: false,
      charsTruncated: 0,
      url,
    };
  }
}

/**
 * Fetch documentation content from a URL.
 * Simple wrapper that returns just the content string.
 * Use fetchDocumentationWithInfo() if you need truncation metadata.
 *
 * @param url - The URL to fetch documentation from
 * @param options - Optional configuration for fetching
 * @returns The documentation content (possibly truncated)
 */
export async function fetchDocumentation(
  url: string,
  options: FetchDocumentationOptions = {}
): Promise<string> {
  const result = await fetchDocumentationWithInfo(url, options);
  return result.content;
}
