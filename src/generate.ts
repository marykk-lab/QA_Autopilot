import { writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import * as cache from "./cache.js";
import { ClaudeGenerator } from "./claude.js";
import type { GeneratedTest, TestRequest } from "./types.js";

export const OUT_DIR = path.resolve("tests/generated");

export interface GenerateResult extends GeneratedTest {
  outputPath: string;
}

/**
 * Pins the spec to the site it was generated against.
 *
 * Generated specs use relative paths, so without this they inherit whatever
 * baseURL the config happens to hold — and a suite covering two targets then
 * runs half its tests against the wrong site. Stamped before review, so what
 * you approve is exactly what runs.
 */
export function pinBaseURL(test: GeneratedTest, baseURL: string): GeneratedTest {
  if (test.code.includes("test.use(")) return test;
  const lines = test.code.split("\n");
  const lastImport = lines.reduce((at, line, i) => (line.startsWith("import ") ? i : at), -1);
  lines.splice(lastImport + 1, 0, "", `test.use({ baseURL: "${baseURL}" });`);
  return { ...test, code: lines.join("\n") };
}

/**
 * Produce a spec without writing it anywhere.
 *
 * Kept separate from saving so a human can read the test before it joins the
 * suite. An unreviewed generated test is a liability: it can pass while
 * asserting the wrong thing, and then it actively hides bugs.
 *
 * Cache first, then Claude. Two reasons, in order of importance:
 *  1. A demo must not depend on a network call succeeding in the room.
 *  2. Regenerating an unchanged request should be free and instant.
 */
export async function produceTest(request: TestRequest): Promise<GeneratedTest> {
  const cached = await cache.read(request);
  if (cached) return pinBaseURL(cached, request.baseURL);

  if (!process.env.ANTHROPIC_API_KEY) {
    const available = await cache.listDescriptions();
    throw new Error(
      [
        "No ANTHROPIC_API_KEY set and this request isn't cached, so there's nothing to replay.",
        "",
        "Either set a key (see .env.example), or try one of the cached requests:",
        ...available.map((d) => `  • ${d}`),
      ].join("\n"),
    );
  }

  const generated = await new ClaudeGenerator().generate(request);
  await cache.write(request, generated);
  return pinBaseURL(generated, request.baseURL);
}

/** Commit a reviewed spec to the suite. */
export async function saveTest(test: GeneratedTest): Promise<string> {
  await mkdir(OUT_DIR, { recursive: true });
  const outputPath = path.join(OUT_DIR, test.filename);
  await writeFile(outputPath, test.code);
  return outputPath;
}

/** Produce and save in one step — what the CLI does. */
export async function generateTest(request: TestRequest): Promise<GenerateResult> {
  const test = await produceTest(request);
  return { ...test, outputPath: await saveTest(test) };
}

/** Spec files currently in the suite. */
export async function listSuite(): Promise<string[]> {
  try {
    const files = await readdir(OUT_DIR);
    return files.filter((f) => f.endsWith(".spec.ts")).sort();
  } catch {
    return [];
  }
}
