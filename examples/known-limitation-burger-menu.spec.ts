/**
 * KNOWN LIMITATION — this test fails, on purpose, and is kept as evidence.
 *
 * Generated 1 Oct 2026 from: "log in as the standard user and check the burger
 * menu opens". It is not in tests/ so it doesn't run with the suite; run it
 * deliberately with:
 *   npx playwright test examples/ --config=playwright.config.ts
 *
 * What happened: `npm run inspect` captures each page's accessibility tree in
 * its initial state. The "Open Menu" button is in that tree, so the model found
 * it correctly. The menu *panel* only exists after the click, so it is not in
 * the tree — the model noticed this, wrote the TODO below, and guessed an id.
 * The guess was wrong.
 *
 * The lesson: a static snapshot captures pages, not post-interaction states.
 * Closing this gap means driving the browser during generation rather than
 * handing the model a snapshot — which is exactly what Playwright's own
 * Generator agent does.
 */
import { test, expect } from "@playwright/test";

test.describe("Burger menu", () => {
  test("standard user can open the burger menu after logging in", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("textbox", { name: "Username" }).fill("standard_user");
    await page.getByRole("textbox", { name: "Password" }).fill("secret_sauce");
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/inventory\.html$/);

    await page.getByRole("button", { name: "Open Menu" }).click();

    // TODO: the opened menu panel is not present in the supplied accessibility tree,
    // falling back to the sidebar container id used by the site.
    await expect(page.locator("#bm-menu-wrap")).toBeVisible();
  });
});
