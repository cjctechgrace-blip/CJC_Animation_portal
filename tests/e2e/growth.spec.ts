import { test, expect, Page } from "@playwright/test";

async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Public signup + admin clearance", () => {
  test("signup → blocked until cleared → admin activates → sign in", async ({
    page,
  }) => {
    const email = `applicant-${Date.now()}@cjc.test`;

    // request access
    await page.goto("/login");
    await page.getByTestId("signup-link").click();
    await expect(page).toHaveURL(/\/signup/);
    await page.fill("#signup-name", "Applicant");
    await page.fill("#signup-email", email);
    await page.fill("#signup-password", "applicant-pass-1");
    await page.getByTestId("signup-submit").click();
    await expect(page.getByTestId("signup-done")).toBeVisible();

    // correct password, but no clearance yet
    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", "applicant-pass-1");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/doesn't have clearance/i)).toBeVisible();

    // admin clears the account
    await login(page, "admin@cjc.test");
    await page.goto("/team");
    const row = page.locator(`[data-testid="member-row"][data-email="${email}"]`);
    await expect(row.getByText(/no access/)).toBeVisible();
    await row.getByTestId("toggle-active").click();
    await expect(row.getByText(/no access/)).toHaveCount(0);
    await page.click('button:has-text("Sign out")');

    // now they're in — as a reviewer (no board link)
    await login(page, email, "applicant-pass-1");
    await expect(page.getByTestId("board-link")).toHaveCount(0);
  });
});

test.describe("Review rounds", () => {
  test("starting round 2 resets approvals and returns episode to review", async ({
    page,
  }) => {
    // reviewer approves round 1
    await login(page, "reviewer@cjc.test");
    await page.goto("/dashboard");
    await page.click('a:has-text("Genesis — Season 1")');
    await page.click('a[href*="/episodes/"]:has-text("Ep 1")');
    await expect(page.getByTestId("review-round")).toHaveText("Round 1");
    await page.getByTestId("approval-toggle").click();
    await expect(page.getByTestId("approval-stats")).toContainText("1 approved");
    await expect(page.getByTestId("start-round")).toHaveCount(0); // reviewers can't
    await page.click('button:has-text("Sign out")');

    // editor starts round 2
    await login(page, "editor@cjc.test");
    await page.goto("/dashboard");
    await page.click('a:has-text("Genesis — Season 1")');
    await page.click('a[href*="/episodes/"]:has-text("Ep 1")');
    page.on("dialog", (d) => d.accept());
    await page.getByTestId("start-round").click();
    await expect(page.getByTestId("review-round")).toHaveText("Round 2");
    await expect(page.getByTestId("approval-stats")).not.toContainText("approved");

    // board shows the round badge
    await page.goto("/board");
    await expect(
      page.locator('[data-testid="board-card"][data-episode="Ep 1 — The First Light"]')
    ).toContainText("Round 2");
  });
});

test.describe("Archive center", () => {
  test("archive a published episode, restore it, then let retention purge it", async ({
    page,
  }) => {
    await login(page, "editor@cjc.test");
    await page.goto("/board");

    const pilot = page.locator(
      '[data-testid="board-card"][data-episode="Ep 0 — Published pilot"]'
    );
    await expect(pilot).toBeVisible();

    // archive → appears in the archive center
    await pilot.getByTestId("archive-episode").click();
    await expect(page.getByTestId("archive-center")).toBeVisible();
    await expect(page.getByTestId("archived-row")).toContainText(
      "Ep 0 — Published pilot"
    );

    // restore → back on the board
    await page.getByTestId("restore-episode").click();
    await expect(page.getByTestId("archive-center")).toHaveCount(0);
    await expect(pilot).toBeVisible();

    // archive again and let the (test-shortened) retention lapse → hard purge
    await pilot.getByTestId("archive-episode").click();
    await expect(page.getByTestId("archived-row")).toBeVisible();
    await page.waitForTimeout(10_000);
    await page.reload();
    await expect(page.getByTestId("archive-center")).toHaveCount(0);
    await expect(
      page.locator('[data-testid="board-card"][data-episode="Ep 0 — Published pilot"]')
    ).toHaveCount(0);
  });
});
