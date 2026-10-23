import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://localhost:3000/" });

const EMAIL = process.env.FEEDBOON_EMAIL ?? "";
const PASSWORD = process.env.FEEDBOON_PASSWORD ?? "";

test.describe("Feedback board", () => {
  test("owner moves FB-069 to the Review column", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

    await page.getByRole("link", { name: /test_org/ }).first().click();
    await expect(page).toHaveURL(/\/projects\/test-org-6fsn/);
    await expect(page.getByRole("heading", { name: "test_org", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Board" }).click();

    const card = page.getByRole("button", { name: /FB-069/ });
    await expect(card).toBeVisible();

    // TODO: FB-069 and the Review column are not in the supplied page structure.
    // The Review column header is assumed to follow the "Select all in <status>" pattern
    // seen for the New column.
    const reviewHeader = page.getByRole("checkbox", { name: "Select all in Review" });
    await expect(reviewHeader).toBeVisible();

    // TODO: board columns expose no landmark role; walking up from the column header.
    const reviewColumn = reviewHeader.locator("xpath=ancestor::div[2]");

    const cardBox = await card.boundingBox();
    const targetBox = await reviewColumn.boundingBox();
    if (!cardBox || !targetBox) {
      throw new Error("Could not resolve drag source or drop target bounds");
    }

    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
      { steps: 20 }
    );
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2 + 10,
      { steps: 10 }
    );
    await page.mouse.up();

    await expect(reviewColumn.getByText("FB-069")).toBeVisible();
  });
});
