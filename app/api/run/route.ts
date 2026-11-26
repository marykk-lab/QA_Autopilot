import { NextResponse, type NextRequest } from "next/server";
import { runSpec } from "@/lib/runner";
import { recordRun } from "@/lib/db";
import { failed, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";
// A browser test against a real site, plus Playwright's own startup.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { filename } = (await request.json().catch(() => ({}))) as { filename?: unknown };
  if (typeof filename !== "string") {
    return NextResponse.json({ error: "Expected a filename." }, { status: 400 });
  }

  try {
    const run = await runSpec(filename);
    const warning = await recordRun(user, run);
    return NextResponse.json({ ...run, warning });
  } catch (error) {
    return failed(error);
  }
}
