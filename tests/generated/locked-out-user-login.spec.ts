import { test, expect } from "@playwright/test";

test.use({ baseURL: "https://www.saucedemo.com" });

test.describe("Login", () => {
  test("locked out user sees the lockout error and stays on the login page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("textbox", { name: "Username" }).fill("locked_out_user");
    await page.getByRole("textbox", { name: "Password" }).fill("secret_sauce");
    await page.getByRole("button", { name: "Login" }).click();

    await expect(
      page.getByText("Epic sadface: Sorry, this user has been locked out.")
    ).toBeVisible();
    await expect(page).toHaveURL("/");
  });
});
