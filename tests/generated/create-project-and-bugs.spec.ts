import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://localhost:3000/" });

const EMAIL = process.env.FEEDBOON_EMAIL ?? "";
const PASSWORD = process.env.FEEDBOON_PASSWORD ?? "";

test.describe("Project creation and bug reporting", () => {
  test("owner creates a project and adds five bugs to its board", async ({ page }) => {
    const projectName = `Project_Fucking ${Date.now()}`;

    // Sign in as the owner
    await page.goto("/login");
    // TODO: confirm the accessible names of the login fields — not supplied in page structure
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

    // Create the project
    // TODO: confirm the label of the "new project" control and the create dialog fields
    await page.getByRole("button", { name: /new project|create project/i }).click();
    await page.getByLabel(/name/i).fill(projectName);
    await page.getByRole("button", { name: /create|save/i }).click();

    await expect(page.getByText(projectName, { exact: true })).toBeVisible();

    // Create 5 bugs on the project's feedback board
    const bugTitles: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const bugTitle = `Bug ${i} ${Date.now()}`;
      bugTitles.push(bugTitle);

      // TODO: confirm the label of the "new bug / new feedback" control and its form fields
      await page.getByRole("button", { name: /new bug|new feedback|add bug|report bug/i }).click();
      await page.getByLabel(/title/i).fill(bugTitle);
      await page.getByRole("button", { name: /create|save|submit/i }).click();

      await expect(page.getByText(bugTitle, { exact: true })).toBeVisible();
    }

    for (const bugTitle of bugTitles) {
      await expect(page.getByText(bugTitle, { exact: true })).toBeVisible();
    }
  });
});
