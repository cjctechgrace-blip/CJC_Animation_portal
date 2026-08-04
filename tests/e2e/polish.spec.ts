import { test, expect, Page } from "@playwright/test";
import path from "node:path";

const SAMPLE_VIDEO = path.join(__dirname, "..", "fixtures", "sample.mp4");

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

test.describe("Renaming", () => {
  test("editor renames a project and an episode", async ({ page }) => {
    await login(page, "editor@cjc.test");

    // project
    await page.goto("/dashboard");
    await page.click('a:has-text("Genesis — Season 1")');
    await page.getByTestId("rename-project").click();
    await page.getByTestId("rename-input").fill("Genesis — Season One");
    await page.getByTestId("rename-save").click();
    await expect(
      page.getByRole("heading", { name: "Genesis — Season One" })
    ).toBeVisible();

    // episode
    await page.click('a[href*="/episodes/"]:has-text("Ep 1")');
    await page.getByTestId("rename-episode").click();
    await page.getByTestId("rename-input").fill("Ep 1 — The First Light!");
    await page.getByTestId("rename-save").click();
    await expect(
      page.getByRole("heading", { name: "Ep 1 — The First Light!" })
    ).toBeVisible();

    // restore both so other tests keep their anchors
    await page.getByTestId("rename-episode").click();
    await page.getByTestId("rename-input").fill("Ep 1 — The First Light");
    await page.getByTestId("rename-save").click();
    await page.click('a[href^="/projects/"]');
    await page.getByTestId("rename-project").click();
    await page.getByTestId("rename-input").fill("Genesis — Season 1");
    await page.getByTestId("rename-save").click();
    await expect(
      page.getByRole("heading", { name: "Genesis — Season 1" })
    ).toBeVisible();
  });

  test("reviewers see no rename buttons", async ({ page }) => {
    await login(page, "reviewer@cjc.test");
    await page.goto("/dashboard");
    await page.click('a:has-text("Genesis — Season 1")');
    await expect(page.getByTestId("rename-project")).toHaveCount(0);
  });
});

test.describe("Freehand drawing", () => {
  test("draw a marker stroke, attach it to a note", async ({ page }) => {
    await login(page, "reviewer@cjc.test");
    await openEp1(page);
    await expect(page.getByTestId("scene-video")).toBeVisible();

    await page.getByTestId("draw-toggle").click();
    await expect(page.getByText(/Draw on the frame/)).toBeVisible();

    const overlay = page.getByTestId("video-overlay");
    await overlay.scrollIntoViewIfNeeded();
    const box = await overlay.boundingBox();
    if (!box) throw new Error("overlay has no bounding box");
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, {
      steps: 12,
    });
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35, {
      steps: 12,
    });
    await page.mouse.up();

    await expect(page.getByTestId("mark-attached")).toContainText("Drawing");

    await page.getByTestId("note-input").fill("Circled the wobbly outline here.");
    await page.getByTestId("add-note").click();
    const comment = page
      .getByTestId("comment-item")
      .filter({ hasText: "wobbly outline" });
    await expect(comment).toBeVisible();

    // clicking the note reveals the drawn path on the video
    await comment.getByTestId("comment-timecode").click();
    await expect(page.locator('svg[data-testid="mark-shape"]')).toBeVisible();

    // clean up the note
    page.on("dialog", (d) => d.accept());
    await comment.getByTestId("delete-comment").click();
  });
});

test.describe("Scene versions (Improvements)", () => {
  test("replacing a clip creates a version with before/after", async ({
    page,
  }) => {
    await login(page, "editor@cjc.test");
    await openEp1(page);
    await expect(page.getByTestId("scene-video")).toBeVisible();

    // no versions yet → no picker
    await expect(page.getByTestId("version-select")).toHaveCount(0);

    // replace the clip (same sample file — content is irrelevant)
    page.on("dialog", (d) => d.accept());
    const input = page
      .getByTestId("replace-clip")
      .locator('input[type="file"]');
    await input.setInputFiles(SAMPLE_VIDEO);

    // picker appears: current = Improvement 1, prior = Original
    await expect(page.getByTestId("version-select")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("version-select")).toContainText(
      "Improvement 1 (current)"
    );

    // before/after flip
    await page.getByTestId("before-after").click(); // → Original
    await expect(page.getByTestId("viewing-old-version")).toContainText(
      "the Original"
    );
    await expect(page.getByTestId("note-input")).toBeHidden();
    await page.getByTestId("before-after").click(); // → back to current
    await expect(page.getByTestId("viewing-old-version")).toHaveCount(0);
    await expect(page.getByTestId("note-input")).toBeVisible();

    // the Original version still streams
    await page.getByTestId("version-select").selectOption("0");
    const src = await page.getByTestId("scene-video").getAttribute("src");
    expect(src).toContain("?v=0");
    const res = await page.request.get(src as string, {
      headers: { Range: "bytes=0-1023" },
    });
    expect([200, 206]).toContain(res.status());
  });
});

test.describe("Notification flow", () => {
  test("episode form has a notify-team option; reviewers send one done-reviewing summary", async ({
    page,
  }) => {
    // the upload form exposes the email choice, checked by default
    await login(page, "editor@cjc.test");
    await page.goto("/dashboard");
    await page.click('a:has-text("Genesis — Season 1")');
    await page.getByTestId("new-episode-toggle").click();
    await expect(page.getByTestId("notify-team")).toBeChecked();
    await page.getByTestId("notify-team").uncheck();
    await page.click('button:has-text("Cancel")');
    await page.click('button:has-text("Sign out")');

    // someone with no fresh notes gets a gentle nudge, not an email
    // (the test admin hasn't authored any seeded notes)
    await login(page, "admin@cjc.test");
    await openEp1(page);
    await page.getByTestId("done-reviewing").click();
    await expect(page.getByTestId("done-reviewing-msg")).toContainText(
      /pin some feedback first/i
    );
    await page.click('button:has-text("Sign out")');

    // a reviewer leaves a note, then sends ONE summary with the session count
    await login(page, "reviewer@cjc.test");
    await openEp1(page);
    await page.getByTestId("note-input").fill("Session note: tighten the cut at the end.");
    await page.getByTestId("add-note").click();
    await expect(
      page.getByTestId("comment-item").filter({ hasText: "tighten the cut" })
    ).toBeVisible();
    await page.getByTestId("done-reviewing").click();
    await expect(page.getByTestId("done-reviewing-msg")).toContainText(
      /Editors notified \(\d+ notes?\)/
    );

    // clean up the note so other tests keep their counts
    page.on("dialog", (d) => d.accept());
    await page
      .getByTestId("comment-item")
      .filter({ hasText: "tighten the cut" })
      .getByTestId("delete-comment")
      .click();
  });
});
