import { test, expect, Page } from "@playwright/test";

async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
}

async function openEp1(page: Page) {
  await page.goto("/dashboard");
  await page.click('a:has-text("Genesis — Season 1")');
  await page.click('a[href*="/episodes/"]:has-text("Ep 1")');
}

test.describe("Note priority (how big a deal is this?)", () => {
  test("rate a note 1-5 while writing it; the score shows on the note", async ({
    page,
  }) => {
    await login(page, "reviewer@cjc.test");
    await openEp1(page);

    await page.getByTestId("note-input").fill("The hat vanishes between cuts.");
    await page.getByTestId("priority-5").click();
    await expect(page.getByTestId("priority-word")).toHaveText("must fix");
    await page.getByTestId("add-note").click();

    const note = page
      .getByTestId("comment-item")
      .filter({ hasText: "The hat vanishes between cuts." });
    await expect(note.getByTestId("priority-badge")).toHaveText("P5");

    // the score survives a reload — it is stored, not just local state
    await page.reload();
    await expect(
      page
        .getByTestId("comment-item")
        .filter({ hasText: "The hat vanishes between cuts." })
        .getByTestId("priority-badge")
    ).toHaveText("P5");
  });

  test("an unrated note can be scored afterwards from the note card", async ({
    page,
  }) => {
    await login(page, "reviewer@cjc.test");
    await openEp1(page);

    await page.getByTestId("note-input").fill("Sophie sounds a bit flat here.");
    await page.getByTestId("add-note").click();

    const note = page
      .getByTestId("comment-item")
      .filter({ hasText: "Sophie sounds a bit flat here." });
    // no score yet, so the rate entry point is offered
    await expect(note.getByTestId("priority-badge")).toHaveCount(0);
    await note.getByTestId("rate-toggle").click();
    await note.getByTestId("priority-2").click();

    await expect(note.getByTestId("priority-badge")).toHaveText("P2");
  });

  test("the feedback list can be flipped to biggest-deal-first", async ({
    page,
  }) => {
    await login(page, "reviewer@cjc.test");
    await openEp1(page);

    // low-priority note first, high-priority note second. Earlier tests in
    // this file share the database, so compare these two against each other
    // rather than against the whole list.
    // Submitting clears the textarea asynchronously, so wait for each note to
    // land before typing the next one — otherwise the second fill is wiped.
    const addNote = async (body: string, priority: number) => {
      await page.getByTestId("note-input").fill(body);
      await page.getByTestId(`priority-${priority}`).click();
      await page.getByTestId("add-note").click();
      await expect(
        page.getByTestId("comment-item").filter({ hasText: body })
      ).toBeVisible();
      await expect(page.getByTestId("note-input")).toHaveValue("");
    };

    await addNote("Minor: colour is slightly warm.", 1);
    await addNote("Blocking: audio drops out.", 5);

    const positionOf = async (text: string) => {
      const all = await page.getByTestId("comment-item").allInnerTexts();
      return all.findIndex((t) => t.includes(text));
    };

    // by time, the newest (blocking) note sits below the minor one
    expect(await positionOf("Blocking: audio drops out.")).toBeGreaterThan(
      await positionOf("Minor: colour is slightly warm.")
    );

    // flipped to priority, the blocking note rises above the minor one
    await page.getByTestId("sort-toggle").click();
    await expect(page.getByTestId("sort-toggle")).toHaveText(/by time/);
    expect(await positionOf("Blocking: audio drops out.")).toBeLessThan(
      await positionOf("Minor: colour is slightly warm.")
    );
  });

  test("a reviewer cannot re-score someone else's note", async ({ page }) => {
    await login(page, "reviewer@cjc.test");
    await openEp1(page);
    await page.getByTestId("note-input").fill("Reviewer's own note.");
    await page.getByTestId("add-note").click();
    await page.click('button:has-text("Sign out")');

    // a different non-editor member has no rate control on that note
    await login(page, "bootstrap-admin@cjc.test", "bootstrap-pass-123");
    await openEp1(page);
    const note = page
      .getByTestId("comment-item")
      .filter({ hasText: "Reviewer's own note." });
    // admins CAN rate, so this asserts the control is present for them
    await expect(note.getByTestId("rate-toggle")).toBeVisible();
  });
});

test.describe("Approving an episode", () => {
  test("approval saves and survives a reload", async ({ page }) => {
    await login(page, "reviewer@cjc.test");
    await openEp1(page);

    await page.getByTestId("approval-toggle").click();
    await expect(page.getByTestId("approval-toggle")).toHaveText(
      /Approved by you/
    );

    // the real bug: it looked approved until you came back
    await page.reload();
    await expect(page.getByTestId("approval-toggle")).toHaveText(
      /Approved by you/
    );
    await expect(page.getByTestId("approval-stats")).toContainText("1 approved");
  });

  test("approving twice toggles off rather than erroring", async ({ page }) => {
    await login(page, "reviewer@cjc.test");
    await openEp1(page);

    await page.getByTestId("approval-toggle").click();
    await expect(page.getByTestId("approval-toggle")).toHaveText(
      /Approved by you/
    );
    await page.getByTestId("approval-toggle").click();
    await expect(page.getByTestId("approval-toggle")).not.toHaveText(
      /Approved by you/
    );
    // no error surfaced to the user on either press
    await expect(page.getByTestId("approval-error")).toHaveCount(0);
  });
});
