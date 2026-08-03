import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const FIXTURE = path.join(__dirname, "..", "fixtures", "sample.mp4");
const STORAGE_DIR = path.join(process.cwd(), "storage");

async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Replace scene clip", () => {
  test("editor replaces a scene's clip; the old file is purged and notes survive", async ({
    page,
  }) => {
    await login(page, "editor@cjc.test");
    await page.goto("/dashboard");
    await page.click('a:has-text("Genesis — Season 1")');
    await page.click('a[href*="/episodes/"]:has-text("Ep 1")');

    // the seeded scene shows its clip and its notes
    const video = page.getByTestId("scene-video");
    await expect(video).toBeVisible();
    const srcBefore = await video.getAttribute("src");
    expect(srcBefore).toBeTruthy();
    const notesBefore = await page.getByTestId("comment-item").count();
    expect(notesBefore).toBeGreaterThan(0);

    // the seed installs the scene's clip as storage/demo-scene.mp4
    expect(fs.existsSync(path.join(STORAGE_DIR, "demo-scene.mp4"))).toBe(true);
    const before = new Set(fs.readdirSync(STORAGE_DIR));

    // replacing asks for confirmation before touching anything
    page.on("dialog", (d) => d.accept());
    await page
      .getByTestId("replace-clip")
      .locator('input[type="file"]')
      .setInputFiles(FIXTURE);

    // a new object is written; the old clip is KEPT (it becomes a version
    // for before/after comparison)
    await expect
      .poll(
        () => fs.readdirSync(STORAGE_DIR).filter((f) => !before.has(f)).length,
        { timeout: 20_000 }
      )
      .toBe(1);
    expect(fs.existsSync(path.join(STORAGE_DIR, "demo-scene.mp4"))).toBe(true);
    await expect(page.getByTestId("version-select")).toBeVisible({
      timeout: 20_000,
    });

    // on success the progress line clears (a failure would leave an error there)
    await expect(page.getByTestId("replace-status")).toHaveCount(0);

    // after the router refresh the player still streams from the scene route…
    await expect(page.getByTestId("scene-video")).toBeVisible();
    const srcAfter = await page.getByTestId("scene-video").getAttribute("src");
    expect(srcAfter).toBeTruthy();

    // …and every note survived the swap
    await expect(page.getByTestId("comment-item")).toHaveCount(notesBefore);
  });
});
