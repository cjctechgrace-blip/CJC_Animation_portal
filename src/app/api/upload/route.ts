import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { putMedia, extensionFor, isCloudStorage } from "@/lib/storage";

export const runtime = "nodejs";

// Local-dev upload endpoint: receives one clip and stores it on disk, so the
// browser upload flow (compress → upload with progress → create scenes) is the
// same locally as in the hosted app. In the cloud the browser PUTs straight to
// Supabase via a signed URL instead and this route refuses to buffer video.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isCloudStorage()) {
    return NextResponse.json(
      { error: "Use the direct upload URL in the hosted app." },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }

  const mimeType = file.type || "video/mp4";
  const ext = extensionFor(mimeType, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await putMedia("videos", `${randomUUID()}.${ext}`, buffer, mimeType);
  return NextResponse.json({ key });
}
