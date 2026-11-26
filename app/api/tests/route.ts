import { NextResponse } from "next/server";
import { listSuite } from "@/lib/generate";
import { lastRuns } from "@/lib/db";
import { requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const [tests, latest] = await Promise.all([listSuite(), lastRuns(user)]);
  return NextResponse.json({ tests, lastRuns: latest });
}
