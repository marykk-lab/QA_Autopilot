import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadSnapshots, renderSnapshots } from "./inspect";
import { loadTarget, renderTarget } from "./target";
import { parseResponse } from "./claude";
import { OUT_DIR, pinBaseURL, readPinnedBaseURL } from "./generate";
import type { GeneratedTest } from "./types";
import type { RunResult } from "./runner";

const MODEL = "claude-opus-5";
const PRICE_INPUT_PER_MTOK = 5.0;
const PRICE_OUTPUT_PER_MTOK = 25.0;

const REPAIR_PROMPT = `You repair failing Playwright tests.

You are given a test that failed, the exact error, and the accessibility tree of
the pages it runs against. Return a corrected version of the whole file.

OUTPUT FORMAT — follow exactly:
Line 1: "FILENAME: <the same filename you were given>"
Then a single TypeScript code block fenced with \`\`\`typescript containing the
complete corrected file. No prose before, between, or after.

HOW TO REPAIR:
- Change only what the error requires. Do not rewrite working steps, rename the
  test, add assertions, or widen what it covers. A repair that changes the
  meaning of the test is worse than the failure.
- Fix the cause, not the symptom. Never "fix" a test by deleting the assertion
  that failed, loosening it to something trivially true, or adding a bare
  waitForTimeout.
- Use only roles and names that appear in PAGE STRUCTURE. If what you need is not
  there, use the most specific CSS selector you can justify and add a // TODO.
- Keep credentials as process.env references. Never inline a secret.
- NEVER change which site the test runs against. Keep test.use({ baseURL }) exactly
  as it is, keep the same paths, the same login, the same assertions about the same
  application. If PAGE STRUCTURE appears to describe a different site than the test,
  say so in a // TODO and change nothing else — a test rewritten to match the wrong
  app passes while testing nothing, which is far worse than a failing test.
- Keep any unique-value suffix (e.g. Date.now()) so the test still survives a
  second run.

COMMON CAUSES, AND WHAT THEY ACTUALLY MEAN:
- "Element is not a <select> element" — the control is a custom combobox
  (Radix/shadcn render <button role="combobox">). selectOption cannot work on it.
  Click the combobox, then click the option:
    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name: "In progress" }).click();
- "strict mode violation: resolved to N elements" — the locator matches several
  things. Scope it to a container, or match a value unique to this run.
- "Timeout ... waiting for locator" — the element never appeared: the name may
  contain volatile text (a count, a date) that has since changed, the element may
  only exist after an interaction, or a required field may have left a submit
  button disabled.
- "element is not enabled" — a precondition is unmet; fill what the form requires
  before clicking submit.`;

export interface RepairResult extends GeneratedTest {
  attempt: number;
  previousError: string;
}

/**
 * Asks the model to fix a test from its own failure output.
 *
 * The repaired file is returned, not written — repairs go through the same human
 * review as a first generation. An automatic fix that quietly weakens an
 * assertion is how a suite rots into one that passes and tests nothing.
 */
export async function repairTest(filename: string, run: RunResult, attempt = 1): Promise<RepairResult> {
  const currentCode = await readFile(path.join(OUT_DIR, filename), "utf8");
  const error = run.specs.find((s) => s.error)?.error ?? run.runError ?? "The test failed without an error message.";

  // The spec says which site it tests. Repairing it against another site's page
  // structure produces a test that passes while testing the wrong application —
  // so refuse rather than guess.
  const baseURL = readPinnedBaseURL(currentCode);
  if (!baseURL) {
    throw new Error(
      `${filename} has no test.use({ baseURL }), so there is no way to tell which site it tests. ` +
        `Add one before repairing.`,
    );
  }

  const snapshots = await loadSnapshots(baseURL);
  if (!snapshots.length) {
    throw new Error(
      `No captured page structure for ${new URL(baseURL).host}. ` +
        `Run: BASE_URL=${baseURL} npm run inspect — repairing without it would rewrite the test blind.`,
    );
  }

  // Only supply the target config when it actually describes this site. Handing a
  // saucedemo test Feedboon's accounts and notes is the same mistake as handing it
  // Feedboon's page tree, just quieter.
  const target = await loadTarget();
  const configuredHost = target.inspect?.baseURL ? new URL(target.inspect.baseURL).host : undefined;
  const targetContext =
    configuredHost === new URL(baseURL).host ? renderTarget(target) : "";
  const pageStructure = renderSnapshots(snapshots);

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: REPAIR_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          targetContext ? `TARGET CONTEXT\n${targetContext}\n` : "",
          pageStructure ? `PAGE STRUCTURE\n${pageStructure}\n` : "",
          `FAILING TEST — ${filename}\n\`\`\`typescript\n${currentCode}\`\`\`\n`,
          `ERROR\n${error}`,
        ].join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined to repair this test.");

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const { code } = parseResponse(text);
  // Re-stamp the target: a repair must never move a test to another site.
  const pinned = pinBaseURL({ filename, code, source: "claude" }, baseURL);
  const { input_tokens: inputTokens, output_tokens: outputTokens } = response.usage;

  return {
    filename,
    code: pinned.code,
    source: "claude",
    attempt,
    previousError: error,
    usage: {
      inputTokens,
      outputTokens,
      estimatedCostUsd:
        (inputTokens / 1_000_000) * PRICE_INPUT_PER_MTOK + (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK,
    },
  };
}
