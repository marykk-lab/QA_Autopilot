import { NextResponse } from "next/server";
import { BASE_URL } from "@/lib/app-config";
import { requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  return NextResponse.json({
    baseURL: BASE_URL,
    liveGeneration: Boolean(process.env.ANTHROPIC_API_KEY),
    email: user.email,
  });
}
