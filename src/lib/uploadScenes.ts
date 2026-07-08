import { createSignedUploadAction } from "@/lib/actions";
import { compressToUnder } from "@/lib/compressVideo";

export type SceneUpload = { title: string; videoKey: string; mimeType: string };

export type UploadStatus = {
  index: number;
  total: number;
  pct: number;
  phase: "compress" | "upload";
  note?: string;
};

const MB = 1024 * 1024;
// Supabase free tier caps files at 50MB. Compress anything close to it,
// targeting comfortably under.
const COMPRESS_ABOVE = 49 * MB;
const TARGET_BYTES = 47 * MB;

function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onPct: (n: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else if (xhr.status === 413)
        reject(new Error("A clip is still over the 50 MB limit after compression."));
      else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(file);
  });
}

/** Compress (if oversized) then upload each clip directly to Supabase Storage. */
export async function uploadScenesToStorage(
  files: File[],
  onProgress: (status: UploadStatus) => void
): Promise<SceneUpload[]> {
  const results: SceneUpload[] = [];
  for (let i = 0; i < files.length; i++) {
    let file = files[i];
    const total = files.length;
    const origName = file.name;

    if (file.size > COMPRESS_ABOVE) {
      onProgress({ index: i, total, pct: 0, phase: "compress", note: "Preparing…" });
      file = await compressToUnder(file, TARGET_BYTES, (pct, note) =>
        onProgress({ index: i, total, pct, phase: "compress", note })
      );
    }

    onProgress({ index: i, total, pct: 0, phase: "upload" });
    const mimeType = file.type || "video/mp4";
    const up = await createSignedUploadAction({ filename: file.name, contentType: mimeType });
    if (!up.ok || !up.uploadUrl || !up.key) {
      throw new Error(up.error || "Could not start upload.");
    }
    await putWithProgress(up.uploadUrl, file, mimeType, (pct) =>
      onProgress({ index: i, total, pct, phase: "upload" })
    );

    results.push({
      title: origName.replace(/\.[^.]+$/, ""),
      videoKey: up.key,
      mimeType,
    });
  }
  return results;
}
