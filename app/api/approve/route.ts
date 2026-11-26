import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { saveTest } from "@/lib/generate";
import { recordSpec } from "@/lib/db";
import { BASE_URL } from "@/lib/app-config";
import { failed, requireUser } from "@/lib/api";
import type { GeneratedTest } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Commits a reviewed spec to the suite — the only path by which a test file
 * appears on disk.
 */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const test = validateTest(body);
  if (!test) {
    return NextResponse.json(
      { error: "Expected a generated test with a filename and code." },
      { status: 400 },
    );
  }

  try {
    const outputPath = await saveTest(test);
    const description = typeof body.description === "string" ? body.description : null;
    const warning = await recordSpec(user, test, BASE_URL, description);
    return NextResponse.json({
      outputPath: path.relative(process.cwd(), outputPath),
      warning,
    });
  } catch (error) {
    return failed(error);
  }
}

/**
 * The filename becomes a path on disk, so it is constrained to a plain basename
 * here rather than trusted — no directory separators, no traversal.
 */
function validateTest(body: Record<string, unknown>): GeneratedTest | null {
  const { filename, code, source, usage } = body;
  if (typeof filename !== "string" || typeof code !== "string") return null;
  if (filename !== path.basename(filename) || !filename.endsWith(".spec.ts")) return null;
  if (!code.includes("@playwright/test")) return null;
  return {
    filename,
    code,
    source: source === "claude" ? "claude" : "cache",
    usage: usage as GeneratedTest["usage"],
  };
}
