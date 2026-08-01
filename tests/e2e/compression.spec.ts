import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Proves the Phase 1 pipeline: a big clip is re-encoded in the browser
// (WebCodecs) before upload and lands in storage much smaller. The fixture is
// too large to commit, so the test runs only when one is provided:
//   BIG_VIDEO=/path/to/big.mp4 npx playwright test compression
const BIG_VIDEO =
  process.env.BIG_VIDEO || path.join(__dirname, "..", "fixtures", "big-test.mp4");

const STORAGE_DIR = path.join(process.cwd(), "storage");

test.describe("Phase 1 — in-browser compression", () => {
  test.skip(!fs.existsSync(BIG_VIDEO), "no big fixture (set BIG_VIDEO)");

  test("a large clip is compressed in the browser before upload", async ({
    page,
  }) => {
    test.setTimeout(300_000); // software encoding in CI browsers can be slow

    const originalSize = fs.statSync(BIG_VIDEO).size;
    const before = new Set(fs.readdirSync(STORAGE_DIR));

    await page.goto("/login");
    await page.fill("#email", "admin@cjc.test");
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByTestId("new-project-toggle").click();
    await page.fill("#name", `Compression ${Date.now()}`);
    await page.click('button:has-text("Create project")');
    await expect(page).toHaveURL(/\/projects\//);

    await page.getByTestId("new-episode-toggle").click();
    await page.fill("#title", "Ep — compression test");
    await page.setInputFiles("#video", BIG_VIDEO);
    await page.click('button:has-text("Create episode")');

    // the compress phase must surface to the user
    await expect(page.getByTestId("upload-status")).toContainText(
      /Compressing clip 1 of 1/,
      { timeout: 30_000 }
    );

    await expect(page).toHaveURL(/\/episodes\//, { timeout: 240_000 });

    // the stored file must be meaningfully smaller than the original
    const added = fs
      .readdirSync(STORAGE_DIR)
      .filter((f) => !before.has(f) && /\.(mp4|webm|mov|mkv)$/.test(f));
    expect(added.length).toBe(1);
    const storedSize = fs.statSync(path.join(STORAGE_DIR, added[0])).size;
    expect(storedSize).toBeGreaterThan(0);
    expect(storedSize).toBeLessThan(originalSize * 0.8);
  });
});
