import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://localhost:3000/" });

const EMAIL = process.env.FEEDBOON_EMAIL ?? "";
const PASSWORD = process.env.FEEDBOON_PASSWORD ?? "";

test.describe("Feedback board — create task", () => {
  test("owner logs in and creates a bug named Hey_Laura", async ({ page }) => {
    const title = `Hey_Laura ${Date.now()}`;

    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

    await page.goto("/projects/test-org-6fsn");
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
