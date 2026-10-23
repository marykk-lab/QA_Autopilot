import { test, expect } from "@playwright/test";

test.use({ baseURL: "https://www.saucedemo.com" });

test.describe("Products page appearance", () => {
  test("standard user sees the products page rendered as expected", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("textbox", { name: "Username" }).fill("standard_user");
    await page.getByRole("textbox", { name: "Password" }).fill("secret_sauce");
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/inventory\.html$/);
    await expect(page.getByText("Products", { exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot("products-page.png");
  });
});
