import { NextRequest } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { storagePathFor } from "@/lib/storage";

export const runtime = "nodejs";

const MIME_FALLBACK = "video/mp4";

export async function GET(
  req: NextRequest,
  { params }: { params: { episodeId: string } }
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const episode = await db.episode.findUnique({
    where: { id: params.episodeId },
    select: { videoFile: true, mimeType: true },
  });
  if (!episode?.videoFile) {
    return new Response("No video", { status: 404 });
  }

  const filePath = storagePathFor(episode.videoFile);
  if (!fs.existsSync(filePath)) {
    return new Response("File missing", { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const size = stat.size;
  const contentType = episode.mimeType || MIME_FALLBACK;
  const range = req.headers.get("range");

  // Range request → 206 partial content (enables scrubbing/seeking).
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
    const nodeStream = fs.createReadStream(filePath, { start, end });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
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

  // No range → full file, but advertise range support so the player can seek.
  const nodeStream = fs.createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}
