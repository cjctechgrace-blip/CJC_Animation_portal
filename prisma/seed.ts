import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const db = new PrismaClient();

// Invite-only: accounts are created here (or by an admin), never by open signup.
const DEMO_PASSWORD = "password123";

const USERS = [
  { email: "admin@cjc.test", name: "Grace (Admin)", role: "admin" },
  { email: "editor@cjc.test", name: "Daniel (Editor)", role: "member" },
  { email: "reviewer@cjc.test", name: "Ada (Reviewer)", role: "member" },
];

/** Copy the sample fixture into local storage so the demo episode has a real, playable video. */
function installDemoVideo(): string | null {
  const src = path.join(process.cwd(), "tests", "fixtures", "sample.mp4");
  if (!fs.existsSync(src)) return null;
  const storageDir = path.join(process.cwd(), "storage");
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
  const fileName = "demo-episode.mp4";
  fs.copyFileSync(src, path.join(storageDir, fileName));
  return fileName;
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const byEmail: Record<string, string> = {};
  for (const u of USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    });
    byEmail[u.email] = user.id;
  }
  const adminId = byEmail["admin@cjc.test"];
  const editorId = byEmail["editor@cjc.test"];
  const reviewerId = byEmail["reviewer@cjc.test"];

  // Sample project.
  let project = await db.project.findFirst({
    where: { name: "Genesis — Season 1" },
  });
  if (!project) {
    project = await db.project.create({
      data: {
        name: "Genesis — Season 1",
        description:
          "First animated season. Episodes reviewed scene by scene.",
        createdById: adminId,
      },
    });
  }

  // Demo episode with a real video + example feedback, so the portal is
  // immediately reviewable on first login.
  const existingEpisode = await db.episode.findFirst({
    where: { title: "Ep 1 — The First Light", projectId: project.id },
  });
  if (!existingEpisode) {
    const videoFile = installDemoVideo();
    const episode = await db.episode.create({
      data: {
        projectId: project.id,
        title: "Ep 1 — The First Light",
        description:
          "Rough cut of the opening scene. Please pin feedback to exact moments.",
        videoFile,
        mimeType: videoFile ? "video/mp4" : null,
        createdById: editorId,
      },
    });

    const flat = await db.comment.create({
      data: {
        episodeId: episode.id,
        authorId: reviewerId,
        body: "The lighting feels too flat here — can we add a warm key light?",
        timecodeMs: 1500,
      },
    });
    await db.comment.create({
      data: {
        episodeId: episode.id,
        authorId: editorId,
        parentId: flat.id,
        body: "Agreed. I'll regenerate this shot with warmer lighting.",
      },
    });
    await db.comment.create({
      data: {
        episodeId: episode.id,
        authorId: adminId,
        body: "The character's mouth movement drifts out of sync with the audio.",
        timecodeMs: 3200,
      },
    });
    await db.comment.create({
      data: {
        episodeId: episode.id,
        authorId: editorId,
        body: "Love this opening frame — keep it.",
        timecodeMs: 500,
        resolved: true,
      },
    });
  }

  console.log(`Seeded ${USERS.length} users (password: "${DEMO_PASSWORD}")`);
  for (const u of USERS) console.log(`  - ${u.email}  [${u.role}]`);
  console.log(`Seeded project + demo episode with example feedback.`);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
