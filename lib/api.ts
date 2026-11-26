import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { currentUser } from "./supabase/server";

/**
 * Every route handler starts here.
 *
 * The middleware already turns anonymous browser traffic away, but these
 * handlers write files and spawn processes, so they check for themselves rather
 * than trusting that a request got past it.
 */
export async function requireUser(): Promise<
  { user: User; response?: never } | { user?: never; response: NextResponse }
> {
  const user = await currentUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  }
  return { user };
}

/** 422 for anything the user can fix by rephrasing or configuring; 500 is a bug. */
export function failed(error: unknown, status = 422): NextResponse {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status },
  );
}
