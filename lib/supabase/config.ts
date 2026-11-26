/**
 * Supabase connection details.
 *
 * Deliberately not defaulted to anything: a silently-missing URL turns every
 * auth call into an unexplained network error, and a project that "works" with
 * no backend configured is worse than one that refuses to start.
 *
 * Local (`npm run db:start`) and hosted projects differ only in these two
 * values, so nothing in the app is tied to either.
 *
 * Both are read as literal `process.env.NEXT_PUBLIC_*` expressions, not through
 * a variable key. Next replaces these statically when it builds the client
 * bundle, and a computed lookup like `process.env[name]` is left alone — so in
 * the browser it reads undefined and the login page dies on module evaluation.
 */
export const SUPABASE_URL = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = required(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill in the Supabase URL and anon key ` +
        `(npm run db:start prints both, or take them from the project's API settings).`,
    );
  }
  return value;
}
