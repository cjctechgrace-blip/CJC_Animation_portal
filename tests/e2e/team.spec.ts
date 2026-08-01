import { test, expect, Page } from "@playwright/test";

async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Phase 3 — team accounts & accountability", () => {
  test("admin sees the Team page; members don't", async ({ page }) => {
    await login(page, "admin@cjc.test");
    await expect(page.getByTestId("team-link")).toBeVisible();
    await page.getByTestId("team-link").click();
    await expect(page).toHaveURL(/\/team/);
    await expect(page.getByTestId("member-list")).toBeVisible();

    // member: no Team link, direct URL bounces to dashboard
    await page.click('button:has-text("Sign out")');
    await login(page, "reviewer@cjc.test");
    await expect(page.getByTestId("team-link")).toHaveCount(0);
    await page.goto("/team");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("full invite lifecycle: invite → accept → sign in as new member", async ({
    page,
  }) => {
    const email = `newbie-${Date.now()}@cjc.test`;

    await login(page, "admin@cjc.test");
    await page.goto("/team");
    await page.getByTestId("invite-toggle").click();
    await page.fill("#invite-email", email);
    await page.fill("#invite-name", "Newbie");
    await page.getByTestId("create-invite").click();

    const link = await page.getByTestId("invite-link").textContent();
    expect(link).toContain("/invite/");
    await page.click('button:has-text("Sign out")');

    // the invitee opens the link and sets their own password
    await page.goto(link as string);
    await expect(page.getByText("invited you")).toBeVisible();
    await page.fill("#accept-password", "brand-new-pass-1");
    await page.fill("#accept-confirm", "brand-new-pass-1");
    await page.getByTestId("accept-invite").click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText("Newbie")).toBeVisible();

    // the link is single-use
    await page.click('button:has-text("Sign out")');
    await page.goto(link as string);
    await expect(page.getByText(/invalid or has expired/)).toBeVisible();

    // and the chosen credentials work for a normal sign-in
    await login(page, email, "brand-new-pass-1");
  });

  test("members can't delete other people's notes; admins can", async ({
    page,
  }) => {
    // seeded scene 1 has notes from Ada (reviewer) and Grace (admin)
    await login(page, "editor@cjc.test");
    await page.goto("/dashboard");
    await page.click('a:has-text("Genesis — Season 1")');
    await page.click('a[href^="/episodes/"]');
    await expect(page.getByTestId("comment-item").first()).toBeVisible();

    // editor authored none of the seeded top-level notes → no delete buttons
    const deleteButtons = page.getByTestId("delete-comment");
    await expect(deleteButtons).toHaveCount(0);

    // but the admin sees delete on every note
    await page.click('button:has-text("Sign out")');
    await login(page, "admin@cjc.test");
    await page.goto("/dashboard");
    await page.click('a:has-text("Genesis — Season 1")');
    await page.click('a[href^="/episodes/"]');
    await expect(page.getByTestId("comment-item").first()).toBeVisible();
    expect(await page.getByTestId("delete-comment").count()).toBeGreaterThan(0);
  });

  test("deactivated members can't sign in; reactivated ones can", async ({
    page,
  }) => {
    await login(page, "admin@cjc.test");
    await page.goto("/team");

    const row = page.locator('[data-testid="member-row"][data-email="reviewer@cjc.test"]');
    await row.getByTestId("toggle-active").click(); // deactivate
    await expect(row.getByText("deactivated")).toBeVisible();
    await page.click('button:has-text("Sign out")');

    await page.goto("/login");
    await page.fill("#email", "reviewer@cjc.test");
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/don't match/i)).toBeVisible();

    // reactivate to leave the seed data clean
    await login(page, "admin@cjc.test");
    await page.goto("/team");
    await row.getByTestId("toggle-active").click();
    await expect(row.getByText("deactivated")).toHaveCount(0);
  });

  test("episode page shows the activity feed with attribution", async ({
    page,
  }) => {
    await login(page, "admin@cjc.test");
    await page.goto("/dashboard");
    await page.click('a:has-text("Genesis — Season 1")');
    await page.click('a[href^="/episodes/"]');

    await expect(page.getByTestId("activity-toggle")).toBeVisible();
    await page.getByTestId("activity-toggle").click();
    const feed = page.getByTestId("activity-feed");
    await expect(feed).toBeVisible();
    // seeded events: Daniel added scenes, Ada pinned a note, Grace noted
    await expect(feed).toContainText("Daniel");
    await expect(feed).toContainText("added scene");
    await expect(feed).toContainText("pinned a note");
  });
});
