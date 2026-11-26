/**
 * Loads .env into process.env, if there is one.
 *
 * Node does not do this on its own — without it, adding a key to .env looks like
 * it worked and silently doesn't. Imported first by the CLI and the server so it
 * runs before anything reads process.env.
 *
 * Uses the built-in loader (Node 20.12+), so there's no dotenv dependency.
 * Real environment variables win: process.loadEnvFile does not overwrite a
 * variable that is already set, so `ANTHROPIC_API_KEY=... npm run dev` still
 * overrides the file.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env, or it isn't readable — that's a supported way to run (cache-only mode).
}
