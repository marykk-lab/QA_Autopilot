import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://localhost:3000/" });

const EMAIL = process.env.FEEDBOON_EMAIL ?? "";
const PASSWORD = process.env.FEEDBOON_PASSWORD ?? "";

test.describe("test_org feedback board", () => {
  test("creates a new bug task and shows it on the board", async ({ page }) => {
    const title = `Automated bug ${Date.now()}`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "test_org google.com" }).click();
    await expect(page.getByRole("heading", { name: "test_org", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Add task" }).click();

    const dialog = page.getByRole("dialog", { name: "New task" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("textbox", { name: "Title *" }).fill(title);
    await dialog.getByRole("button", { name: "Create task" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("paragraph").filter({ hasText: title })).toBeVisible();
  });
});
