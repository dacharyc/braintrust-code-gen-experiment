/**
 * Utility for fetching documentation content from URLs
 */

export interface FetchDocumentationOptions {
  /** Whether to log progress to console (default: true) */
  verbose?: boolean;
}

/**
 * Fetch documentation content from a URL.
 * Supports .md URLs which return raw markdown.
 *
 * @param url - The URL to fetch documentation from
 * @param options - Optional configuration for fetching
 * @returns The documentation content
 */
export async function fetchDocumentation(
  url: string,
  options: FetchDocumentationOptions = {}
): Promise<string> {
  const { verbose = true } = options;

  try {
    if (verbose) {
      console.log(`[Docs] Fetching documentation from: ${url}`);
    }

    const response = await fetch(url);
    if (!response.ok) {
      if (verbose) {
        console.warn(`[Docs] Failed to fetch: ${response.status} ${response.statusText}`);
      }
      return `[Documentation could not be loaded from ${url}]`;
    }

    const content = await response.text();
    if (verbose) {
      console.log(`[Docs] Fetched ${content.length} characters of documentation`);
    }

    return content;
  } catch (error) {
    if (verbose) {
      console.warn(
        `[Docs] Error fetching documentation:`,
        error instanceof Error ? error.message : String(error)
      );
    }
    return `[Documentation could not be loaded from ${url}]`;
  }
}
