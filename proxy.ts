import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/session";

/**
 * Runs before every request: refreshes the auth cookie and turns anonymous
 * traffic away. Called `proxy` because Next 16 renamed the middleware
 * convention; the behaviour is the same.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except Next's own assets and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
