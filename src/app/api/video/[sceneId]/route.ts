import { NextRequest } from "next/server";
import fs from "node:fs";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { storagePathFor, isCloudStorage, publicUrl } from "@/lib/storage";

export const runtime = "nodejs";

const MIME_FALLBACK = "video/mp4";

/** Node stream → web stream that survives client aborts: cancel() destroys the
 * file stream, and late events can never hit a closed controller. */
function fileStream(path: string, opts?: { start: number; end: number }): ReadableStream {
  const nodeStream = fs.createReadStream(path, opts);
  let closed = false;
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: string | Buffer) => {
        if (closed) return;
        controller.enqueue(
          typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)
        );
      });
      nodeStream.on("end", () => {
        if (closed) return;
        closed = true;
        controller.close();
      });
      nodeStream.on("error", (err) => {
        if (closed) return;
        closed = true;
        controller.error(err);
      });
    },
    cancel() {
      closed = true;
      nodeStream.destroy();
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const scene = await db.scene.findUnique({
    where: { id: params.sceneId },
    select: { videoFile: true, mimeType: true },
  });
  if (!scene?.videoFile) {
    return new Response("No video", { status: 404 });
  }

  // Bunny Stream: redirect to the CDN rendition once encoding is done.
  if (scene.videoFile.startsWith("bunny:")) {
    const { getBunnyVideoState, bunnyVideoIdFromKey } = await import("@/lib/bunny");
    const state = await getBunnyVideoState(bunnyVideoIdFromKey(scene.videoFile));
    if (state.ready && state.mp4Url) return Response.redirect(state.mp4Url, 307);
    return new Response("Video is still processing", { status: 503 });
  }

  // Cloud: hand off to Supabase Storage's public URL (it supports Range/seeking).
  if (isCloudStorage()) {
    return Response.redirect(publicUrl(scene.videoFile), 307);
  }

  const filePath = storagePathFor(scene.videoFile);
  if (!fs.existsSync(filePath)) {
    return new Response("File missing", { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const size = stat.size;
  const contentType = scene.mimeType || MIME_FALLBACK;
  const range = req.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    let start = match && match[1] ? parseInt(match[1], 10) : 0;
    let end = match && match[2] ? parseInt(match[2], 10) : size - 1;

    if (Number.isNaN(start) || start < 0) start = 0;
    if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    const chunkSize = end - start + 1;
    return new Response(fileStream(filePath, { start, end }), {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(fileStream(filePath), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}
