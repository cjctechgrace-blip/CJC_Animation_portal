import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const db = new PrismaClient();

const DEMO_PASSWORD = "password123";
const USERS = [
  { email: "cjctechgrace@gmail.com", name: "Grace (Admin)", role: "admin", pw: "CJCportal2026!" },
  { email: "editor@cjc.test", name: "Daniel (Editor)", role: "member", pw: DEMO_PASSWORD },
  { email: "reviewer@cjc.test", name: "Ada (Reviewer)", role: "member", pw: DEMO_PASSWORD },
];

function installDemoVideo(): string | null {
  const src = path.join(process.cwd(), "tests", "fixtures", "sample.mp4");
  if (!fs.existsSync(src)) return null;
  const dir = path.join(process.cwd(), "storage");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const name = "demo-scene.mp4";
  fs.copyFileSync(src, path.join(dir, name));
  return name;
}

async function main() {
  const byEmail: Record<string, string> = {};
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.pw, 10);
    const user = await db.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash },
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    });
    byEmail[u.email] = user.id;
  }
  const adminId = byEmail["cjctechgrace@gmail.com"];
  const editorId = byEmail["editor@cjc.test"];
  const reviewerId = byEmail["reviewer@cjc.test"];

  let project = await db.project.findFirst({ where: { name: "Genesis — Season 1" } });
  if (!project) {
    project = await db.project.create({
      data: {
        name: "Genesis — Season 1",
        description: "First animated season. Upload scene clips and review scene by scene.",
        createdById: adminId,
      },
    });
  }

  const existing = await db.episode.findFirst({
    where: { title: "Ep 1 — The First Light", projectId: project.id },
  });
  if (!existing) {
    const episode = await db.episode.create({
      data: {
        projectId: project.id,
        title: "Ep 1 — The First Light",
        description: "Opening episode. Each scene is a short AI-generated clip.",
        createdById: editorId,
      },
    });

    const videoFile = installDemoVideo();
    const scene1 = await db.scene.create({
      data: {
        episodeId: episode.id,
        title: "Scene 1 — Sunrise",
        order: 0,
        videoFile,
        mimeType: videoFile ? "video/mp4" : null,
        createdById: editorId,
      },
    });
    await db.scene.create({
      data: {
        episodeId: episode.id,
        title: "Scene 2 — The Call",
        order: 1,
        createdById: editorId,
      },
    });

    const note = await db.comment.create({
      data: {
        sceneId: scene1.id,
        authorId: reviewerId,
        body: "The lighting feels too flat here — can we add a warm key light?",
        timecodeMs: 1500,
      },
    });
    await db.comment.create({
      data: {
        sceneId: scene1.id,
        authorId: editorId,
        parentId: note.id,
        body: "Agreed. I'll regenerate this shot with warmer lighting.",
      },
    });
    await db.comment.create({
      data: {
        sceneId: scene1.id,
        authorId: adminId,
        body: "Love this opening frame — keep it.",
        timecodeMs: 500,
        resolved: true,
      },
    });
  }

  console.log(`Seeded ${USERS.length} users, project + demo episode with scenes.`);
  for (const u of USERS) console.log(`  - ${u.email} [${u.role}] pw:${u.pw}`);
}

main()
  .then(async () => { await db.$disconnect(); })
  .catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
