import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { putMedia, extensionFor } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const project = await db.project.findUnique({
    where: { id: params.projectId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const form = await req.formData();
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const file = form.get("video");

  if (!title) {
    return NextResponse.redirect(
      new URL(`/projects/${params.projectId}?error=title`, req.url)
    );
  }

  let videoFile: string | null = null;
  let mimeType: string | null = null;

  if (file && file instanceof File && file.size > 0) {
    mimeType = file.type || "video/mp4";
    const ext = extensionFor(mimeType, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    videoFile = await putMedia("videos", `${randomUUID()}.${ext}`, buffer, mimeType);
  }

  const episode = await db.episode.create({
    data: {
      projectId: params.projectId,
      title,
      description,
      videoFile,
      mimeType,
      createdById: user.id,
    },
  });

  return NextResponse.redirect(new URL(`/episodes/${episode.id}`, req.url), {
    status: 303,
  });
}
