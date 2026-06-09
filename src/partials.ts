import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

/** File extensions that are loaded as Handlebars partial templates. */
export const SUPPORTED_PARTIAL_EXTENSIONS = [
  ".md",
  ".hbs",
  ".handlebars",
  ".prompt",
  ".partial",
] as const;

/** A discovered partial template ready for registration. */
export interface DiscoveredPartial {
  /** Root-relative partial name without extension, using `/` separators. */
  name: string;
  /** Raw partial template source. */
  source: string;
}

const supportedExtensions = new Set<string>(SUPPORTED_PARTIAL_EXTENSIONS);

async function collectPartialFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPartialFiles(path)));
    } else if (entry.isFile() && supportedExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

function partialName(root: string, path: string): string {
  const name = relative(root, path).slice(0, -extname(path).length);
  return name.split("\\").join("/");
}

/**
 * Recursively discover partial templates from roots in ascending precedence.
 * Later roots override earlier roots when they define the same partial name.
 */
export async function discoverPartials(
  roots: readonly string[],
): Promise<DiscoveredPartial[]> {
  const partials = new Map<string, DiscoveredPartial>();

  for (const root of roots) {
    for (const path of await collectPartialFiles(root)) {
      const partial = {
        name: partialName(root, path),
        source: await readFile(path, "utf8"),
      };
      partials.set(partial.name, partial);
    }
  }

  return Array.from(partials.values());
}
