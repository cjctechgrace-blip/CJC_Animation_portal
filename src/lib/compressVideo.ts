// Client-side video compression via WebCodecs (hardware-accelerated in modern
// browsers), using mediabunny for demux/remux. Heavy clips shrink 5-10x before
// they ever leave the browser; anything that can't be compressed (old browser,
// odd codec, encoder failure) falls back to the original file untouched.

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
} from "mediabunny";

const MB = 1024 * 1024;

/** Files at or under this size upload as-is — compression isn't worth it. */
export const COMPRESS_THRESHOLD = 8 * MB;

/** Cap output at 1080p; review doesn't need more. */
const MAX_HEIGHT = 1080;

export type CompressResult = {
  file: File;
  /** false when the original was passed through (small file or fallback). */
  compressed: boolean;
  note?: string;
};

export function browserSupportsCompression(): boolean {
  return (
    typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined"
  );
}

/**
 * Compress a clip to review quality (H.264 MP4, ≤1080p). Resolves with the
 * original file when compression is unsupported, fails, or doesn't help.
 */
export async function compressVideo(
  file: File,
  onProgress: (pct: number) => void
): Promise<CompressResult> {
  if (file.size <= COMPRESS_THRESHOLD) {
    return { file, compressed: false, note: "already small" };
  }
  if (!browserSupportsCompression()) {
    return { file, compressed: false, note: "browser lacks WebCodecs" };
  }

  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(file),
    });
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });

    const conversion = await Conversion.init({
      input,
      output,
      video: {
        height: MAX_HEIGHT, // width follows aspect ratio; no upscaling happens
        codec: "avc",
        quality: QUALITY_MEDIUM,
      },
      audio: {
        codec: "aac",
        bitrate: 128_000,
      },
    });

    if (!conversion.isValid) {
      return { file, compressed: false, note: "clip not convertible" };
    }

    conversion.onProgress = (p) => onProgress(Math.round(p * 100));
    await conversion.execute();

    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      return { file, compressed: false, note: "empty output" };
    }
    if (buffer.byteLength >= file.size) {
      return { file, compressed: false, note: "original already efficient" };
    }

    const newName = file.name.replace(/\.[^.]+$/, "") + ".mp4";
    const compressedFile = new File([buffer], newName, { type: "video/mp4" });
    return { file: compressedFile, compressed: true };
  } catch {
    // Whatever went wrong (unsupported codec, encoder error), the upload must
    // still work — send the original.
    return { file, compressed: false, note: "compression failed" };
  }
}
