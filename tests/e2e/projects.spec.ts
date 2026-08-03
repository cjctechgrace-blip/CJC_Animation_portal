import { test, expect, Page } from "@playwright/test";

async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Project lifecycle", () => {
  test("create then delete a project", async ({ page }) => {
    await login(page, "admin@cjc.test");

    const name = `Deletable ${Date.now()}`;
    await page.getByTestId("new-project-toggle").click();
    await page.fill("#name", name);
    await page.click('button:has-text("Create project")');
    await expect(page).toHaveURL(/\/projects\//);

    page.on("dialog", (d) => d.accept());
    await page.getByTestId("delete-project").click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("editors can delete projects they didn't create", async ({ page }) => {
    await login(page, "admin@cjc.test");
    const name = `Editor-deletable ${Date.now()}`;
    await page.getByTestId("new-project-toggle").click();
    await page.fill("#name", name);
    await page.click('button:has-text("Create project")');
    await expect(page).toHaveURL(/\/projects\//);
    const url = page.url();
    await page.click('button:has-text("Sign out")');

    await login(page, "editor@cjc.test");
    await page.goto(url);
    page.on("dialog", (d) => d.accept());
    await expect(page.getByTestId("delete-project")).toBeVisible();
    await page.getByTestId("delete-project").click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(name)).toHaveCount(0);
  });
});
