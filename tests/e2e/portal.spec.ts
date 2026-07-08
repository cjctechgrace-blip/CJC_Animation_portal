import { test, expect, Page } from "@playwright/test";
import path from "node:path";
import { formatTimecode } from "../../src/lib/format";

const SAMPLE_VIDEO = path.join(__dirname, "..", "fixtures", "sample.mp4");

async function login(page: Page, email = "admin@cjc.test") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Log in, create a project + episode with the sample video, and wait for playback-ready. */
async function setupEpisodeWithVideo(page: Page): Promise<void> {
  await login(page);
  await page.getByTestId("new-project-toggle").click();
  await page.fill("#name", `P2 Project ${Date.now()}`);
  await page.click('button:has-text("Create project")');
  await expect(page).toHaveURL(/\/projects\//);

  await page.getByTestId("new-episode-toggle").click();
  await page.fill("#title", "Ep — frame test");
  await page.setInputFiles("#video", SAMPLE_VIDEO);
  await page.click('button:has-text("Create episode")');
  await expect(page).toHaveURL(/\/episodes\//);

  await page.waitForFunction(() => {
    const v = document.querySelector(
      '[data-testid="episode-video"]'
    ) as HTMLVideoElement | null;
    return !!v && v.readyState >= 2 && v.duration > 0;
  });
  await page.evaluate(() => {
    const v = document.querySelector(
      '[data-testid="episode-video"]'
    ) as HTMLVideoElement;
    v.currentTime = 2;
    v.pause();
  });
  await page.waitForFunction(() => {
    const v = document.querySelector(
      '[data-testid="episode-video"]'
    ) as HTMLVideoElement;
    return v.readyState >= 2 && Math.abs(v.currentTime - 2) < 0.5;
  });
}

test.describe("Auth (invite-only)", () => {
  test("protected pages redirect to login when signed out", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("wrong password is rejected with a message", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "admin@cjc.test");
    await page.fill("#password", "wrongpass");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/don't match/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("valid login then logout", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await page.click('button:has-text("Sign out")');
    await expect(page).toHaveURL(/\/login/);
    // guard still holds after logout
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Full review workflow", () => {
  test("create project, upload episode, pin timestamped note, seek, reply, resolve", async ({
    page,
  }) => {
    await login(page);

    // --- create a project ---
    const projectName = `Test Project ${Date.now()}`;
    await page.getByTestId("new-project-toggle").click();
    await page.fill("#name", projectName);
    await page.fill("#description", "Created by the e2e suite.");
    await page.click('button:has-text("Create project")');

    await expect(page).toHaveURL(/\/projects\//);
    await expect(
      page.getByRole("heading", { name: projectName })
    ).toBeVisible();

    // --- add an episode with a real video upload ---
    await page.getByTestId("new-episode-toggle").click();
    await page.fill("#title", "Ep 1 — e2e");
    await page.setInputFiles("#video", SAMPLE_VIDEO);
    await page.click('button:has-text("Create episode")');

    await expect(page).toHaveURL(/\/episodes\//);
    const episodeUrl = page.url();
    const episodeId = episodeUrl.split("/episodes/")[1];

    // --- the video streams with Range support (206) ---
    const rangeRes = await page.request.get(`/api/video/${episodeId}`, {
      headers: { Range: "bytes=0-1023" },
    });
    expect(rangeRes.status()).toBe(206);
    expect(rangeRes.headers()["content-range"]).toContain("/");
    expect(rangeRes.headers()["accept-ranges"]).toBe("bytes");

    // --- video element loads real metadata (duration known) ---
    const video = page.getByTestId("episode-video");
    await expect(video).toBeVisible();
    await page.waitForFunction(() => {
      const v = document.querySelector(
        '[data-testid="episode-video"]'
      ) as HTMLVideoElement | null;
      return !!v && v.readyState >= 1 && v.duration > 0;
    });

    // --- seek to a known point, then pin a note there ---
    await page.evaluate(() => {
      const v = document.querySelector(
        '[data-testid="episode-video"]'
      ) as HTMLVideoElement;
      v.currentTime = 2;
      v.pause();
    });
    await page.waitForFunction(() => {
      const v = document.querySelector(
        '[data-testid="episode-video"]'
      ) as HTMLVideoElement;
      return Math.abs(v.currentTime - 2) < 0.4;
    });

    const pinnedSeconds = await page.evaluate(() => {
      const v = document.querySelector(
        '[data-testid="episode-video"]'
      ) as HTMLVideoElement;
      return v.currentTime;
    });
    const expectedTimecode = formatTimecode(Math.round(pinnedSeconds * 1000));

    await page.getByTestId("note-input").fill("Her hand clips through the door here.");
    await page.getByTestId("add-note").click();

    // --- the note appears, pinned to the right timecode ---
    const firstComment = page.getByTestId("comment-item").first();
    await expect(firstComment).toBeVisible();
    await expect(firstComment).toContainText("Her hand clips through the door");
    await expect(firstComment.getByTestId("comment-timecode")).toHaveText(
      expectedTimecode
    );

    // --- clicking the timecode seeks the player back to that moment ---
    await page.evaluate(() => {
      const v = document.querySelector(
        '[data-testid="episode-video"]'
      ) as HTMLVideoElement;
      v.currentTime = 0;
    });
    await firstComment.getByTestId("comment-timecode").click();
    await page.waitForFunction(
      (target) => {
        const v = document.querySelector(
          '[data-testid="episode-video"]'
        ) as HTMLVideoElement;
        return Math.abs(v.currentTime - target) < 0.4;
      },
      pinnedSeconds
    );

    // --- reply to the note ---
    await firstComment.getByTestId("reply-toggle").click();
    await firstComment.getByTestId("reply-input").fill("Good catch — regenerating this shot.");
    await firstComment.getByTestId("reply-submit").click();
    await expect(firstComment).toContainText("Good catch — regenerating this shot.");

    // --- resolve the note ---
    await expect(firstComment).toHaveAttribute("data-resolved", "false");
    await firstComment.getByTestId("resolve-toggle").click();
    await expect(firstComment).toHaveAttribute("data-resolved", "true");
    await expect(firstComment.getByTestId("resolve-toggle")).toHaveText(/reopen/i);
  });
});

test.describe("Phase 2 — draw on frame + Higgsfield prompt", () => {
  test("capture and annotate a frame, attach it, then generate a Higgsfield prompt", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await setupEpisodeWithVideo(page);

    // --- capture the current frame to draw on ---
    await page.getByTestId("capture-frame").click();
    const annotator = page.getByTestId("frame-annotator");
    await expect(annotator).toBeVisible();

    // --- draw a stroke on the frame canvas ---
    const canvas = page.getByTestId("frame-canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3);
    await page.mouse.up();

    // --- attach the annotated frame to the note ---
    await page.getByTestId("frame-attach").click();
    await expect(page.getByTestId("frame-attached")).toBeVisible();

    // --- write and pin the note ---
    await page
      .getByTestId("note-input")
      .fill("Make the character turn toward the camera here.");
    await page.getByTestId("add-note").click();

    const comment = page.getByTestId("comment-item").first();
    await expect(comment).toBeVisible();

    // --- the pinned frame is stored and served ---
    const frame = comment.getByTestId("comment-frame");
    await expect(frame).toBeVisible();
    const frameSrc = await frame.getAttribute("src");
    expect(frameSrc).toMatch(/\/api\/frame\//);
    const frameRes = await page.request.get(frameSrc!);
    expect(frameRes.status()).toBe(200);
    expect(frameRes.headers()["content-type"]).toBe("image/png");

    // --- generate the Higgsfield prompt (mock path: no API key in test env) ---
    await comment.getByTestId("make-prompt").click();
    const prompt = comment.getByTestId("generated-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/turn toward the camera/i);

    // --- copy works ---
    await comment.getByTestId("copy-prompt").click();
    await expect(comment.getByTestId("copy-prompt")).toHaveText(/copied/i);
  });
});
