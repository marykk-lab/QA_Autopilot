/**
 * DEMO ARTIFACT — deliberately broken, for showing the repair loop.
 *
 * The button is named "Log In Now"; the real one is "Login". To demo:
 *   cp examples/broken-for-repair-demo.spec.ts tests/generated/
 *   npm run dev            → Run it (fails) → "Fix with AI" → review → Approve
 * or from the terminal:
 *   npm run fix -- broken-for-repair-demo.spec.ts
 *
 * Requires saucedemo's page tree:
 *   BASE_URL=https://www.saucedemo.com npm run inspect
 * Without it the repair refuses rather than guessing — see docs/scope.md.
 */
import { test, expect } from "@playwright/test";

test.use({ baseURL: "https://www.saucedemo.com" });

test.describe("Repair demo", () => {
  test("standard user reaches the products page", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Username").fill("standard_user");
    await page.getByPlaceholder("Password").fill("secret_sauce");
    await page.getByRole("button", { name: "Log In Now" }).click();
    await expect(page).toHaveURL(/inventory\.html/);
  });
});
