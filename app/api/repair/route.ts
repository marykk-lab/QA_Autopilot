import { NextResponse, type NextRequest } from "next/server";
import { listSuite } from "@/lib/generate";
import { runSpec } from "@/lib/runner";
import { repairTest } from "@/lib/repair";
import { failed, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Proposes a fix; never writes it.
 *
 * The result goes through the same review as a first generation — an automatic
 * fix that quietly weakens an assertion is how a suite rots into one that passes
 * and tests nothing.
 */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { filename } = (await request.json().catch(() => ({}))) as { filename?: unknown };
  if (typeof filename !== "string") {
    return NextResponse.json({ error: "Expected a filename." }, { status: 400 });
  }

  try {
    if (!(await listSuite()).includes(filename)) {
      return NextResponse.json({ error: `No such test in the suite: ${filename}` }, { status: 404 });
    }
    const run = await runSpec(filename);
    if (run.passed) {
      return NextResponse.json({ error: "That test passes — nothing to repair." }, { status: 422 });
    }
    return NextResponse.json(await repairTest(filename, run));
  } catch (error) {
    return failed(error);
  }
}
