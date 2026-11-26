import { spawn } from "node:child_process";
import path from "node:path";
import { listSuite } from "./generate";

const PLAYWRIGHT_BIN = path.resolve("node_modules/.bin/playwright");

export interface SpecResult {
  title: string;
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
  durationMs: number;
  error?: string;
}

export interface RunResult {
  filename: string;
  passed: boolean;
  specs: SpecResult[];
  /** Set when the run itself failed (config error, crash) rather than a test failing. */
  runError?: string;
}

/**
 * Runs one spec file and reports structured results.
 *
 * `filename` arrives from the browser, so it is checked against the files that
 * actually exist in the suite before anything is spawned — never interpolated
 * into a shell. The binary is invoked directly with an argument array, so there
 * is no shell to inject into either.
 */
export async function runSpec(filename: string): Promise<RunResult> {
  const suite = await listSuite();
  if (!suite.includes(filename)) {
    return { filename, passed: false, specs: [], runError: `No such test in the suite: ${filename}` };
  }

  const { stdout, stderr, code } = await exec(PLAYWRIGHT_BIN, [
    "test",
    path.join("tests/generated", filename),
    "--reporter=json",
  ]);

  let report: unknown;
  try {
    report = JSON.parse(stdout);
  } catch {
    return {
      filename,
      passed: false,
      specs: [],
      runError: (stderr || stdout || `playwright exited with code ${code}`).slice(0, 2000),
    };
  }

  const specs = flattenSpecs(report);
  return {
    filename,
    passed: code === 0 && specs.length > 0 && specs.every((s) => s.status === "passed"),
    specs,
    runError: specs.length === 0 ? "The run produced no test results." : undefined,
  };
}

function exec(
  bin: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: process.cwd(), env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => resolve({ stdout, stderr: String(err), code: null }));
    child.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

/**
 * Playwright's JSON report nests specs inside suites, one level per
 * test.describe(), so this walks the tree rather than assuming a depth.
 */
function flattenSpecs(report: unknown): SpecResult[] {
  const out: SpecResult[] = [];

  const walk = (node: any): void => {
    for (const spec of node?.specs ?? []) {
      const result = spec?.tests?.[0]?.results?.[0];
      out.push({
        title: spec.title ?? "(untitled)",
        status: result?.status ?? "skipped",
        durationMs: result?.duration ?? 0,
        error: result?.error?.message ? stripAnsi(result.error.message) : undefined,
      });
    }
    for (const child of node?.suites ?? []) walk(child);
  };

  for (const suite of (report as any)?.suites ?? []) walk(suite);
  return out;
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;]*m/g, "").slice(0, 4000);
}
