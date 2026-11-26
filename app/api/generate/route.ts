import { NextResponse, type NextRequest } from "next/server";
import { produceTest } from "@/lib/generate";
import { BASE_URL } from "@/lib/app-config";
import { failed, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";
// A cold generation is a model call against a page tree; well past the default.
export const maxDuration = 120;

/**
 * Produces a spec and returns it. Writes nothing.
 *
 * Generation and approval are separate calls on purpose: the suite can only
 * change by a human decision, and that review gate is the thing Playwright's
 * own test agents don't have.
 */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { description } = (await request.json().catch(() => ({}))) as { description?: unknown };
  if (typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "Describe the test you want." }, { status: 400 });
  }

  try {
    const test = await produceTest({ description: description.trim(), baseURL: BASE_URL });
    return NextResponse.json({ ...test, description: description.trim() });
  } catch (error) {
    return failed(error);
  }
}
