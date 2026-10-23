/**
 * WORKED EXAMPLE — a real production site, not a practice site.
 *
 * Generated 1 Oct 2026 against https://en.wikipedia.org and verified passing.
 * It lives outside tests/ because it needs a different BASE_URL. Run it with:
 *   BASE_URL=https://en.wikipedia.org npx playwright test examples/wikipedia-search.spec.ts
 *
 * It took two attempts, and the first failure is the lesson:
 *   1. Asked to "check the results page lists at least one result", the model
 *      flagged in a TODO that the results page wasn't in the captured tree, then
 *      guessed `.mw-search-results > li`. It failed — because on Wikipedia an
 *      exact title match jumps straight to the article and there IS no results
 *      page. The description was wrong about the site, and the TODO was the
 *      warning sign a reviewer should have caught.
 *   2. With /wiki/Playwright added to target.local.json's inspect.pages and a
 *      description matching real behaviour, it passed first try.
 *
 * On a real site you need two things: the pages the flow touches in the snapshot,
 * and a description that matches what the site actually does.
 */
import { test, expect } from "@playwright/test";

test.describe("Wikipedia search", () => {
  test("searching for Playwright opens the Playwright article", async ({ page }) => {
    await page.goto("/wiki/Main_Page");

    const searchBox = page.getByRole("searchbox", { name: "Search Wikipedia" });
    await expect(searchBox).toBeVisible();
    await searchBox.fill("Playwright");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page).toHaveURL(/\/wiki\/Playwright$/);
    await expect(page.getByRole("heading", { name: "Playwright", level: 1 })).toBeVisible();
  });
});
