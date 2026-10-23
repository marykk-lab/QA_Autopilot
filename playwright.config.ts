import { defineConfig, devices } from "@playwright/test";

// Generated specs read credentials from process.env, so .env must be loaded
// before they run. Node does not do this on its own.
try {
  process.loadEnvFile();
} catch {
  // No .env — fine for targets that need no sign-in.
}

/**
 * Generated tests live in tests/generated/ and are plain Playwright specs —
 * nothing in this repo is required to run them. That portability is the point:
 * the output is yours, not locked into a vendor's format.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "https://www.saucedemo.com",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  expect: {
    // Screenshot comparison tolerance — a few anti-aliased pixels shouldn't fail a run.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
