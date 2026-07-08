// In-browser video compression via ffmpeg.wasm. Re-encodes an oversized clip to
// H.264, lowering the bitrate each pass until it fits under the size limit.
// Loaded lazily (the wasm core is ~32MB) and only in the browser.

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

let ffmpegPromise: Promise<FFmpegInstance> | null = null;

async function getFFmpeg(): Promise<FFmpegInstance> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ff = new FFmpeg();
      await ff.load({
        coreURL: "/ffmpeg/ffmpeg-core.js",
        wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      });
      return ff;
    })();
  }
  return ffmpegPromise;
}

function getDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (d: number) => {
      URL.revokeObjectURL(v.src);
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => done(0);
    v.src = URL.createObjectURL(file);
  });
}

export type CompressProgress = (pct: number, note: string) => void;

/**
 * Compress `file` to at most `maxBytes`, retaining as much quality as possible.
 * Iterates: compute a target bitrate, encode, and if still too big, drop the
 * bitrate (and, if needed, the resolution) and try again.
 */
export async function compressToUnder(
  file: File,
  maxBytes: number,
  onProgress: CompressProgress
): Promise<File> {
  const { fetchFile } = await import("@ffmpeg/util");
  const ffmpeg = await getFFmpeg();

  const duration = (await getDurationSeconds(file)) || 30;
  const inName = "input" + (file.name.match(/\.[^.]+$/)?.[0] || ".mp4");
  await ffmpeg.writeFile(inName, await fetchFile(file));

  const audioKbps = 128;
  const targetBytes = Math.floor(maxBytes * 0.92); // headroom
  let totalKbps = Math.max(300, Math.floor((targetBytes * 8) / 1000 / duration));
  let maxHeight: number | null = null;

  let attempt = 0;
  const onFfProgress = ({ progress }: { progress: number }) => {
    const pct = Math.max(0, Math.min(99, Math.round(progress * 100)));
    onProgress(pct, `Compressing (pass ${attempt + 1})`);
  };
  ffmpeg.on("progress", onFfProgress);

  let result: Uint8Array | null = null;
  try {
    for (attempt = 0; attempt < 6; attempt++) {
      const vKbps = Math.max(120, totalKbps - audioKbps);
      const out = "output.mp4";
      const args = [
        "-i", inName,
        "-c:v", "libx264",
        "-b:v", `${vKbps}k`,
        "-maxrate", `${Math.floor(vKbps * 1.45)}k`,
        "-bufsize", `${vKbps * 2}k`,
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
      ];
      if (maxHeight) args.push("-vf", `scale=-2:${maxHeight}`);
      args.push(
        "-c:a", "aac", "-b:a", `${audioKbps}k`,
        "-movflags", "+faststart",
        "-y", out
      );

      await ffmpeg.exec(args);
      const data = (await ffmpeg.readFile(out)) as Uint8Array;
      await ffmpeg.deleteFile(out).catch(() => {});
      result = data;

      if (data.byteLength <= maxBytes) break;

      // still too big → tighten for the next pass
      const ratio = maxBytes / data.byteLength;
      totalKbps = Math.max(150, Math.floor(totalKbps * ratio * 0.9));
      if (totalKbps < 900 && (maxHeight === null || maxHeight > 720)) maxHeight = 720;
      if (totalKbps < 500 && (maxHeight === null || maxHeight > 480)) maxHeight = 480;
    }
  } finally {
    ffmpeg.off("progress", onFfProgress);
    await ffmpeg.deleteFile(inName).catch(() => {});
  }

  if (!result || result.byteLength > maxBytes) {
    throw new Error(
      "Couldn't get this clip under the size limit even after compressing. Try a shorter clip."
    );
  }

  onProgress(100, "Compressed");
  const base = file.name.replace(/\.[^.]+$/, "");
  return new File([result as BlobPart], `${base}-compressed.mp4`, {
    type: "video/mp4",
  });
}

// TEMP self-test hook (removed after verification).
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__compressToUnder = compressToUnder;
}
