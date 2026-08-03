import { test, expect, Page } from "@playwright/test";

async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Publishing board (Kanban)", () => {
  test("editors and admins see the board; reviewers don't", async ({ page }) => {
    // video editor: link + page
    await login(page, "editor@cjc.test");
    await expect(page.getByTestId("board-link")).toBeVisible();
    await page.getByTestId("board-link").click();
    await expect(page).toHaveURL(/\/board/);
    await expect(page.getByTestId("column-review")).toBeVisible();
    await expect(page.getByTestId("column-approved")).toBeVisible();
    await expect(page.getByTestId("column-scheduled")).toBeVisible();
    await expect(page.getByTestId("column-published")).toBeVisible();
    await page.click('button:has-text("Sign out")');

    // reviewer: no link, direct URL bounces
    await login(page, "reviewer@cjc.test");
    await expect(page.getByTestId("board-link")).toHaveCount(0);
    await page.goto("/board");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("approve → schedule → appears in Scheduled with a date", async ({
    page,
  }) => {
    await login(page, "editor@cjc.test");
    await page.goto("/board");

    // the seeded episode starts in review
    const card = page.locator(
      '[data-testid="board-card"][data-episode="Ep 1 — The First Light"]'
    );
    await expect(card).toBeVisible();
    await expect(
      page.getByTestId("column-review").locator('[data-testid="board-card"]')
    ).toHaveCount(1);

    // approve
    await card.getByTestId("approve-episode").click();
    await expect(
      page.getByTestId("column-approved").locator('[data-testid="board-card"]')
    ).toHaveCount(1);

    // schedule for tomorrow 09:00
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const when = `${tomorrow.toISOString().slice(0, 10)}T09:00`;
    await card.getByTestId("schedule-toggle").click();
    await card.getByTestId("publish-when").fill(when);
    await card.getByTestId("confirm-schedule").click();

    const scheduledCol = page.getByTestId("column-scheduled");
    await expect(
      scheduledCol.locator('[data-testid="board-card"]')
    ).toHaveCount(1);
    await expect(scheduledCol).toContainText("🗓");
    await expect(page.getByTestId("upcoming-schedule")).toContainText(
      "Ep 1 — The First Light"
    );

    // unschedule back to approved (no YouTube configured locally)
    await card.getByTestId("unschedule").click();
    await expect(
      page.getByTestId("column-approved").locator('[data-testid="board-card"]')
    ).toHaveCount(1);

    // return the seed to its starting state for other tests
    await page
      .locator('[data-testid="board-card"][data-episode="Ep 1 — The First Light"]')
      .locator('button:has-text("Back to review")')
      .click();
    await expect(
      page.getByTestId("column-review").locator('[data-testid="board-card"]')
    ).toHaveCount(1);
  });

  test("reviewer approvals roll up: approve on episode, counts on board", async ({
    page,
  }) => {
    // reviewer opens the episode and gives their sign-off
    await login(page, "reviewer@cjc.test");
    await page.goto("/dashboard");
    await page.click('a:has-text("Genesis — Season 1")');
    await page.click('a[href*="/episodes/"]:has-text("Ep 1")');
    await expect(page.getByTestId("approval-bar")).toBeVisible();
    await page.getByTestId("approval-toggle").click();
    await expect(page.getByTestId("approval-toggle")).toHaveText(/Approved by you/);
    await expect(page.getByTestId("approval-stats")).toContainText("1 approved");
    await expect(page.getByTestId("approval-stats")).toContainText("Ada");
    await page.click('button:has-text("Sign out")');

    // the board (editor view) shows viewed/approved/feedback counts
    await login(page, "editor@cjc.test");
    await page.goto("/board");
    const stats = page
      .locator('[data-testid="board-card"][data-episode="Ep 1 — The First Light"]')
      .getByTestId("card-stats");
    await expect(stats).toContainText("✓ 1 approved");
    await expect(stats).toContainText("viewed");

    // undo to leave the seed clean
    await page.goto("/dashboard");
    await page.click('a:has-text("Genesis — Season 1")');
    await page.click('a[href*="/episodes/"]:has-text("Ep 1")');
    // editor hasn't approved; the reviewer's approval persists in stats
    await expect(page.getByTestId("approval-stats")).toContainText("1 approved");
  });

  test("scheduling rejects past dates", async ({ page }) => {
    await login(page, "admin@cjc.test");
    await page.goto("/board");
    const card = page.locator('[data-testid="board-card"]').first();

    await card.getByTestId("approve-episode").click();
    await card.getByTestId("schedule-toggle").click();
    await card.getByTestId("publish-when").fill("2020-01-01T09:00");
    await card.getByTestId("confirm-schedule").click();
    await expect(card.getByText(/at least 5 minutes from now/)).toBeVisible();

    // restore
    await card.locator('button:has-text("Back to review")').click();
  });
});
