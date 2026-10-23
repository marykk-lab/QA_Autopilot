import "./env.js"; // must run before anything reads process.env
import { chromium, type Page } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadTarget, resolveCredential, type Target, type FieldLocator } from "./target.js";

// Deliberately not inside cache/ — that directory holds generated-test entries
// and is read back by cache.listDescriptions().
const SNAPSHOT_DIR = path.resolve("page-cache");

/**
 * Snapshots are stored per target, not in one shared file.
 *
 * With a single file, a suite covering two sites hands the generator whichever
 * target was inspected last. A repair then "fixes" a test by rewriting it
 * against the wrong application — and it passes, which is worse than failing.
 */
export function snapshotFile(baseURL: string): string {
  const host = new URL(baseURL).host.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return path.join(SNAPSHOT_DIR, `${host}.json`);
}
const MAX_CHARS_PER_PAGE = 6000;
/** Below this, a capture is almost certainly a pre-render shell rather than a page. */
const MIN_USEFUL_CHARS = 200;

export interface PageSnapshot {
  name: string;
  path: string;
  tree: string;
}

/**
 * Captures the accessibility tree of the pages under test.
 *
 * Without this the model is inventing selectors from prose. It produced
 * `getByRole("button", { name: "Add to cart Sauce Labs Backpack" })` for a button
 * whose real accessible name is just "Add to cart" — a confident, plausible,
 * wrong guess, and no amount of prompt wording fixes it. The model has to see
 * the page. This is also why Playwright's own Generator agent drives a live
 * browser while it writes.
 */
export async function capture(target: Target): Promise<PageSnapshot[]> {
  const config = target.inspect;
  if (!config?.pages?.length) return [];

  // BASE_URL wins when set, so one env var points everything at another site.
  const baseURL = process.env.BASE_URL ?? config.baseURL;
  if (!baseURL) throw new Error("No baseURL — set BASE_URL or target.json inspect.baseURL.");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const snapshots: PageSnapshot[] = [];
  let signedIn = false;

  try {
    for (const entry of config.pages) {
      if (entry.requiresSignIn && !signedIn) {
        await signIn(page, target, baseURL);
        signedIn = true;
      }
      await page.goto(new URL(entry.path, baseURL).toString());

      if (entry.waitFor) {
        await locate(page, entry.waitFor).waitFor({ state: "visible", timeout: 30000 });
      }

      let tree = await settledSnapshot(page, config.settleMs ?? 400);

      if (entry.frames) tree += await frameTrees(page);

      if (tree.length < MIN_USEFUL_CHARS) {
        console.warn(
          `  ⚠ ${entry.name} (${entry.path}) captured only ${tree.length} chars — ` +
            `the page probably hadn't rendered yet. Add a "waitFor" for this page in target.json, ` +
            `or raise inspect.settleMs.`,
        );
      }

      snapshots.push({
        name: entry.name,
        path: entry.path,
        tree: truncate(tree),
      });

      for (const state of entry.states ?? []) {
        // Reload first so each state starts from the same clean page.
        await page.goto(new URL(entry.path, baseURL).toString());
        if (entry.waitFor) {
          await locate(page, entry.waitFor).waitFor({ state: "visible", timeout: 30000 });
        }
        for (const step of state.click) {
          await locate(page, step).first().click();
        }
        if (state.waitFor) {
          await locate(page, state.waitFor).waitFor({ state: "visible", timeout: 15000 });
        }
        const stateTree = await settledSnapshot(page, config.settleMs ?? 400);
        snapshots.push({
          name: `${entry.name} → ${state.name}`,
          path: `${entry.path} (after: ${state.name})`,
          tree: truncate(stateTree),
        });
      }
    }
  } finally {
    await browser.close();
  }

  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(snapshotFile(baseURL), JSON.stringify(snapshots, null, 2) + "\n");
  return snapshots;
}

function truncate(tree: string): string {
  return tree.length > MAX_CHARS_PER_PAGE ? tree.slice(0, MAX_CHARS_PER_PAGE) + "\n…(truncated)" : tree;
}

/**
 * Captures the tree repeatedly until it stops changing.
 *
 * A single snapshot at domcontentloaded catches a React/Next app before
 * hydration — the result is a near-empty tree, no error, and a model that goes
 * straight back to guessing selectors. Waiting for two identical consecutive
 * reads handles late rendering without needing to know how the app is built.
 */
async function settledSnapshot(page: Page, settleMs: number): Promise<string> {
  let previous = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await page.locator("body").ariaSnapshot();
    if (current === previous && current.length > 0) return current;
    previous = current;
    await page.waitForTimeout(settleMs);
  }
  return previous;
}

/**
 * ariaSnapshot() does not cross frame boundaries, so anything inside an iframe
 * is invisible to the model unless it is captured separately.
 */
async function frameTrees(page: Page): Promise<string> {
  const parts: string[] = [];
  for (const [index, frame] of page.frames().entries()) {
    if (frame === page.mainFrame()) continue;
    try {
      const tree = await frame.locator("body").ariaSnapshot();
      if (tree.trim()) {
        parts.push(`\n\n### iframe ${index} (${frame.url()})\n${tree}`);
      }
    } catch {
      parts.push(`\n\n### iframe ${index} (${frame.url()}) — not readable (cross-origin)`);
    }
  }
  return parts.join("");
}

/** Reads what `npm run inspect` captured. Generation never launches a browser itself. */
export async function loadSnapshots(baseURL: string): Promise<PageSnapshot[]> {
  try {
    return JSON.parse(await readFile(snapshotFile(baseURL), "utf8")) as PageSnapshot[];
  } catch {
    return [];
  }
}

export function renderSnapshots(snapshots: PageSnapshot[]): string {
  if (!snapshots.length) return "";
  return [
    "Accessibility tree of each page, captured from the live site. Use these exact",
    "roles and names in locators — do not guess a name that is not listed here.",
    "This is a snapshot from one moment: any count, badge number, date or total in",
    "it will have changed by the time the test runs. Match the stable part of a name.",
    ...snapshots.map((s) => `\n## ${s.name} (${s.path})\n${s.tree}`),
  ].join("\n");
}

async function signIn(page: Page, target: Target, baseURL: string): Promise<void> {
  const config = target.inspect?.signIn;
  if (!config) throw new Error("A page requires sign-in but target.json has no inspect.signIn block.");

  const entry = target.credentials?.find((c) => c.role === config.credential);
  if (!entry) throw new Error(`No credential with role "${config.credential}" in target.json.`);
  const account = resolveCredential(entry);

  await page.goto(new URL(config.path ?? "/", baseURL).toString());

  if (config.dismiss) {
    // Cookie banners are the most common reason a real-site capture comes back
    // blank or overlaid. Best-effort: don't fail the run if it isn't there.
    await locate(page, config.dismiss).click({ timeout: 5000 }).catch(() => {});
  }

  try {
    await locate(page, config.username).fill(account.username);
    await locate(page, config.password).fill(account.password);
    await locate(page, config.submit).click();
  } catch (error) {
    // Overwhelmingly the most common cause: BASE_URL points at a different site
    // than the one target.json describes.
    throw new Error(
      `Could not sign in at ${page.url()}.\n` +
        `The sign-in locators in target.json didn't match this page. Check that BASE_URL ` +
        `(${baseURL}) and target.json describe the same site — when pointing at another ` +
        `site, put its own config in target.local.json.\n\nUnderlying: ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }`,
    );
  }

  if (config.confirm) {
    // Generous: a dev server compiles the route on first hit, which can take
    // far longer than any production response.
    await locate(page, config.confirm).waitFor({ state: "visible", timeout: 60000 });
  } else {
    await page.waitForLoadState("networkidle");
  }
}

/** Turns a FieldLocator from target.json into a Playwright locator. */
function locate(page: Page, field: FieldLocator) {
  if (field.css) return page.locator(field.css);
  if (field.label) return page.getByLabel(field.label);
  if (field.placeholder) return page.getByPlaceholder(field.placeholder);
  if (field.role) return page.getByRole(field.role as any, field.name ? { name: field.name } : undefined);
  if (field.text) return page.getByText(field.text);
  throw new Error(`Locator in target.json needs one of: css, label, placeholder, role, text — got ${JSON.stringify(field)}`);
}

// `npm run inspect`
if (process.argv[1]?.endsWith("inspect.ts")) {
  const target = await loadTarget();
  const snapshots = await capture(target);
  if (!snapshots.length) {
    console.log("Nothing to inspect — add an `inspect` block to target.json.");
  } else {
    for (const s of snapshots) console.log(`captured ${s.name} (${s.path}) — ${s.tree.length} chars`);
    const url = process.env.BASE_URL ?? target.inspect!.baseURL!;
    console.log(`\n→ ${path.relative(process.cwd(), snapshotFile(url))}`);
  }
}
