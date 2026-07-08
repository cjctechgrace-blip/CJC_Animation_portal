import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { putMedia, extensionFor } from "@/lib/storage";

export const runtime = "nodejs";

// Local-dev fallback for appending scene clips to an existing episode.
export async function POST(
  req: NextRequest,
  { params }: { params: { episodeId: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const episode = await db.episode.findUnique({
    where: { id: params.episodeId },
    select: { id: true, _count: { select: { scenes: true } } },
  });
  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const form = await req.formData();
  const files = form.getAll("video").filter((f): f is File => f instanceof File && f.size > 0);

  let order = episode._count.scenes;
  for (const file of files) {
    const mimeType = file.type || "video/mp4";
    const ext = extensionFor(mimeType, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const videoFile = await putMedia("videos", `${randomUUID()}.${ext}`, buffer, mimeType);
    const base = file.name.replace(/\.[^.]+$/, "");
    await db.scene.create({
      data: {
        episodeId: episode.id,
        title: base || `Scene ${order + 1}`,
        order,
        videoFile,
        mimeType,
        createdById: user.id,
      },
    });
    order++;
  }

  return NextResponse.redirect(new URL(`/episodes/${episode.id}`, req.url), {
    status: 303,
  });
}
