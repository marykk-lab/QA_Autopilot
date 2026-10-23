import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://localhost:3000/" });

const EMAIL = process.env.FEEDBOON_EMAIL ?? "";
const PASSWORD = process.env.FEEDBOON_PASSWORD ?? "";

// TODO: status names are not in the captured page structure (only "New" is shown).
// Adjust these to the statuses configured on a new project's board.
const STATUSES = ["New", "In Progress", "Review", "Done", "Closed"];

test.describe("Project board", () => {
  test("create a project and add five bugs, each in a different board status", async ({
    page,
  }) => {
    test.slow();

    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

    // Create the project
    const projectName = `QA Project ${Date.now()}`;
    await page.getByRole("button", { name: "New Project" }).click();

    const newProjectDialog = page.getByRole("dialog");
    await expect(newProjectDialog).toBeVisible();
    // TODO: the New Project dialog is not in the captured page structure —
    // the name field and submit button are matched generically.
    await newProjectDialog.getByRole("textbox").first().fill(projectName);
    await newProjectDialog.getByRole("button", { name: /create/i }).click();
    await expect(newProjectDialog).toBeHidden();
    await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();

    // Create five bugs, each assigned to a different board status
    for (const status of STATUSES) {
      const bugTitle = `Automated bug ${status} ${Date.now()}`;

      await page.getByRole("button", { name: "Add task" }).click();

      const taskDialog = page.getByRole("dialog", { name: "New task" });
      await expect(taskDialog).toBeVisible();

      await taskDialog.getByRole("textbox", { name: "Title *" }).fill(bugTitle);
      // TODO: the status select has no accessible name — it is the first combobox
      // in the dialog. It is a Radix combobox (a <button>), so the option is
      // picked by clicking it in the portalled listbox rather than selectOption.
      // Creating with a status stands in for dragging on the board, which is not
      // described in the captured page structure.
      await taskDialog.getByRole("combobox").first().click();
      await page.getByRole("option", { name: status, exact: true }).click();

      await taskDialog.getByRole("button", { name: "Create task" }).click();
      await expect(taskDialog).toBeHidden();

      await expect(page.getByText(bugTitle, { exact: true })).toBeVisible();
    }
  });
});
