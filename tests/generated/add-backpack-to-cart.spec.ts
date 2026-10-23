import { test, expect } from "@playwright/test";

test.use({ baseURL: "https://www.saucedemo.com" });

test.describe("Cart badge", () => {
  test("shows 1 after adding the backpack as standard user", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("textbox", { name: "Username" }).fill("standard_user");
    await page.getByRole("textbox", { name: "Password" }).fill("secret_sauce");
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/inventory\.html$/);

    // The backpack's "Add to cart" button is the one inside its product card
    const backpackCard = page
      .locator(".inventory_item")
      .filter({ hasText: "Sauce Labs Backpack" });
    await backpackCard.getByRole("button", { name: "Add to cart" }).click();

    const cartBadge = page.locator(".shopping_cart_badge");
    await expect(cartBadge).toBeVisible();
    await expect(cartBadge).toHaveText("1");
  });
});
