import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type { GeneratedTest, TestRequest } from "./types.js";

const CACHE_DIR = path.resolve("cache");

interface CacheEntry {
  description: string;
  baseURL: string;
  filename: string;
  code: string;
  createdAt: string;
}

/**
 * Keyed on the request only — deliberately not on the system prompt. Editing the
 * prompt therefore doesn't throw away the seeded demo fixtures, and repeat runs
 * of the same request cost nothing.
 */
function key(request: TestRequest): string {
  const normalized = `${request.baseURL}\n${request.description.trim().toLowerCase().replace(/\s+/g, " ")}`;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export async function read(request: TestRequest): Promise<GeneratedTest | null> {
  try {
    const raw = await readFile(path.join(CACHE_DIR, `${key(request)}.json`), "utf8");
    const entry = JSON.parse(raw) as CacheEntry;
    return { filename: entry.filename, code: entry.code, source: "cache" };
  } catch {
    return null;
  }
}

export async function write(request: TestRequest, test: GeneratedTest): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const entry: CacheEntry = {
    description: request.description,
    baseURL: request.baseURL,
    filename: test.filename,
    code: test.code,
    createdAt: new Date().toISOString(),
  };
  await writeFile(path.join(CACHE_DIR, `${key(request)}.json`), JSON.stringify(entry, null, 2) + "\n");
}

/**
 * Used by the CLI to say what can be replayed without a key, and by the UI as
 * one-click examples. Newest first and capped — the list grows with every
 * generation and would otherwise push the rest of the page off screen.
 */
export async function listDescriptions(limit = 6): Promise<string[]> {
  try {
    const files = await readdir(CACHE_DIR);
    const entries = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          try {
            const raw = await readFile(path.join(CACHE_DIR, f), "utf8");
            const { description, createdAt } = JSON.parse(raw) as CacheEntry;
            return typeof description === "string" ? { description, createdAt: createdAt ?? "" } : null;
          } catch {
            return null;
          }
        }),
    );
    return entries
      .filter((e): e is { description: string; createdAt: string } => e !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((e) => e.description);
  } catch {
    return [];
  }
}
