import { test, expect } from "@playwright/test";

test.use({ baseURL: "https://www.saucedemo.com" });

test.describe("Checkout flow", () => {
  test("standard_user can log in, add three items to the cart and complete checkout", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("textbox", { name: "Username" }).fill("standard_user");
    await page.getByRole("textbox", { name: "Password" }).fill("secret_sauce");
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/inventory\.html$/);
    await expect(page.getByText("Products", { exact: true })).toBeVisible();

    const products = [
      "Sauce Labs Backpack",
      "Sauce Labs Bike Light",
      "Sauce Labs Bolt T-Shirt",
    ];

    for (const product of products) {
      // TODO: product cards have no listed role/name; scoping by the .inventory_item container
      await page
        .locator(".inventory_item")
        .filter({ hasText: product })
        .getByRole("button", { name: "Add to cart" })
        .click();
    }

    await expect(page.locator(".shopping_cart_badge")).toHaveText("3");

    // TODO: cart link is exposed as "Cart, empty" only while empty; using the stable cart link class
    await page.locator(".shopping_cart_link").click();
    await expect(page).toHaveURL(/\/cart\.html$/);

    await page.getByRole("button", { name: "Checkout" }).click();

    // TODO: checkout information fields are not in the supplied page structure; using placeholders
    await page.getByPlaceholder("First Name").fill("Jane");
    await page.getByPlaceholder("Last Name").fill("Doe");
    await page.getByPlaceholder("Zip/Postal Code").fill("12345");

    // TODO: "Continue" / "Finish" buttons are not in the supplied page structure
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Finish" }).click();

    await expect(page).toHaveURL(/\/checkout-complete\.html$/);
    // TODO: confirmation heading text not in the supplied page structure
    await expect(
      page.getByRole("heading", { name: "Thank you for your order!" })
    ).toBeVisible();
  });
});
