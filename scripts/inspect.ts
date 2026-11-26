import "../lib/env"; // must run before anything reads process.env
import path from "node:path";
import { capture, snapshotFile } from "../lib/inspect";
import { loadTarget } from "../lib/target";

/**
 * `npm run inspect` — capture the accessibility tree of every page in target.json.
 *
 * Still the generator's eyes until the MCP migration (M3) replaces it with a live
 * browser session. Until then a stale page-cache is a silent source of bad tests,
 * so this is re-run after any change to the app under test.
 */
const target = await loadTarget();
const snapshots = await capture(target);

if (!snapshots.length) {
  console.log("Nothing to inspect — add an `inspect` block to target.json.");
} else {
  for (const s of snapshots) console.log(`captured ${s.name} (${s.path}) — ${s.tree.length} chars`);
  const url = process.env.BASE_URL ?? target.inspect!.baseURL!;
  console.log(`\n→ ${path.relative(process.cwd(), snapshotFile(url))}`);
}
