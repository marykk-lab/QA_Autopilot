import { NextResponse } from "next/server";
import { listDescriptions } from "@/lib/cache";
import { requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Shown as one-click examples. In cache-only mode these are exactly the requests
 * that can be served, so the UI never offers something that fails.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  return NextResponse.json({ examples: await listDescriptions() });
}
