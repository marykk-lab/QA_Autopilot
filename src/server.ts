import "./env.js"; // must run before anything reads process.env
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { produceTest, saveTest, listSuite } from "./generate.js";
import { listDescriptions } from "./cache.js";
import { runSpec } from "./runner.js";
import { repairTest } from "./repair.js";
import type { GeneratedTest } from "./types.js";

const PORT = Number(process.env.PORT ?? 5173);
const HOST = "127.0.0.1"; // local only — this spawns processes, it must not listen publicly
const PUBLIC_DIR = path.resolve("public");
const BASE_URL = process.env.BASE_URL ?? "https://www.saucedemo.com";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/config") {
    return send(res, 200, { baseURL: BASE_URL, liveGeneration: Boolean(process.env.ANTHROPIC_API_KEY) });
  }

  if (req.method === "GET" && url.pathname === "/api/tests") {
    return send(res, 200, { tests: await listSuite() });
  }

  // Shown as one-click examples. In cache-only mode these are exactly the
  // requests that can be served, so the UI never offers something that fails.
  if (req.method === "GET" && url.pathname === "/api/examples") {
    return send(res, 200, { examples: await listDescriptions() });
  }

  if (req.method === "POST" && url.pathname === "/api/generate") {
    const { description } = await readJson(req);
    if (typeof description !== "string" || !description.trim()) {
      return send(res, 400, { error: "Describe the test you want." });
    }
    try {
      const test = await produceTest({ description: description.trim(), baseURL: BASE_URL });
      return send(res, 200, test);
    } catch (error) {
      return send(res, 422, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Approval is a separate call on purpose: nothing reaches the suite until a
  // human has read the code and said yes.
  if (req.method === "POST" && url.pathname === "/api/approve") {
    const body = await readJson(req);
    const test = validateTest(body);
    if (!test) return send(res, 400, { error: "Expected a generated test with a filename and code." });
    const outputPath = await saveTest(test);
    return send(res, 200, { outputPath: path.relative(process.cwd(), outputPath) });
  }

  // Repair proposes a fix; it never writes. The result goes through the same
  // review as a first generation — an automatic fix that quietly weakens an
  // assertion is how a suite rots into one that passes and tests nothing.
  if (req.method === "POST" && url.pathname === "/api/repair") {
    const { filename } = await readJson(req);
    if (typeof filename !== "string") return send(res, 400, { error: "Expected a filename." });
    try {
      if (!(await listSuite()).includes(filename)) {
        return send(res, 404, { error: `No such test in the suite: ${filename}` });
      }
      const run = await runSpec(filename);
      if (run.passed) return send(res, 422, { error: "That test passes — nothing to repair." });
      const repaired = await repairTest(filename, run);
      return send(res, 200, repaired);
    } catch (error) {
      return send(res, 422, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/run") {
    const { filename } = await readJson(req);
    if (typeof filename !== "string") return send(res, 400, { error: "Expected a filename." });
    return send(res, 200, await runSpec(filename));
  }

  if (req.method === "GET") return serveStatic(url.pathname, res);

  send(res, 404, { error: "Not found" });
}

/**
 * The filename becomes a path on disk, so it is constrained to a plain
 * basename here rather than trusted — no directory separators, no traversal.
 */
function validateTest(body: Record<string, unknown>): GeneratedTest | null {
  const { filename, code } = body;
  if (typeof filename !== "string" || typeof code !== "string") return null;
  if (filename !== path.basename(filename) || !filename.endsWith(".spec.ts")) return null;
  if (!code.includes("@playwright/test")) return null;
  return { filename, code, source: "cache" };
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: "Forbidden" });

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      // Dev server: never let a browser serve yesterday's app.js against
      // today's API. A stale page that 404s its own endpoints is baffling.
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    send(res, 404, { error: "Not found" });
  }
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

server.listen(PORT, HOST, () => {
  const mode = process.env.ANTHROPIC_API_KEY
    ? "live generation (ANTHROPIC_API_KEY set)"
    : "cache-only (no ANTHROPIC_API_KEY — cached requests replay)";
  console.log(`\n  AI QA platform → http://${HOST}:${PORT}`);
  console.log(`  target: ${BASE_URL}`);
  console.log(`  mode:   ${mode}\n`);
});
