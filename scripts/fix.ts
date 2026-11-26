import "../lib/env";
import { runSpec } from "../lib/runner";
import { repairTest } from "../lib/repair";
import { saveTest, listSuite } from "../lib/generate";

/**
 * Run → repair → re-run, up to a few attempts.
 *
 * Each attempt is shown so the loop can't quietly weaken a test: you see the
 * error it was given and the fix it made.
 */
const filename = process.argv[2];
const maxAttempts = Number(process.env.MAX_REPAIR_ATTEMPTS ?? 3);

if (!filename) {
  const suite = await listSuite();
  console.error(`Usage: npm run fix -- <spec filename>\n\nIn the suite:\n${suite.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}

let run = await runSpec(filename);
if (run.passed) {
  console.log(`\n✓ ${filename} already passes — nothing to repair.\n`);
  process.exit(0);
}

let totalCost = 0;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const firstError = run.specs.find((s) => s.error)?.error ?? run.runError ?? "(no error text)";
  console.log(`\n── attempt ${attempt}/${maxAttempts} ──`);
  console.log(`failing with: ${firstError.split("\n")[0]}`);

  const repaired = await repairTest(filename, run, attempt);
  totalCost += repaired.usage?.estimatedCostUsd ?? 0;
  await saveTest(repaired);
  console.log(`repaired (${repaired.usage?.inputTokens} in / ${repaired.usage?.outputTokens} out) — re-running…`);

  run = await runSpec(filename);
  if (run.passed) {
    console.log(`\n✓ ${filename} passes after ${attempt} repair${attempt > 1 ? "s" : ""} — $${totalCost.toFixed(4)}`);
    console.log(`  Review the diff before keeping it: git diff tests/generated/${filename}\n`);
    process.exit(0);
  }
}

console.error(`\n✗ ${filename} still fails after ${maxAttempts} attempts — $${totalCost.toFixed(4)}`);
console.error(`  ${run.specs.find((s) => s.error)?.error?.split("\n")[0] ?? run.runError}\n`);
console.error(`  Repair loops stop being useful here: the information needed probably isn't`);
console.error(`  in the captured page structure. Add the relevant state to target.json and re-run inspect.\n`);
process.exit(1);
