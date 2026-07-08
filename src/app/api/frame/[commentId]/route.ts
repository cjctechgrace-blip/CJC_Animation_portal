import { NextRequest } from "next/server";
import fs from "node:fs";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { storagePathFor } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { commentId: string } }
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const comment = await db.comment.findUnique({
    where: { id: params.commentId },
    select: { frameImage: true },
  });
  if (!comment?.frameImage) return new Response("No frame", { status: 404 });

  const filePath = storagePathFor(comment.frameImage);
  if (!fs.existsSync(filePath)) return new Response("Missing", { status: 404 });

  const data = fs.readFileSync(filePath);
  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
