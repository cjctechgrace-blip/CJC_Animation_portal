import { createSignedUploadAction } from "@/lib/actions";

export type SceneUpload = { title: string; videoKey: string; mimeType: string };

export type UploadStatus = {
  index: number;
  total: number;
  pct: number;
  phase: "compress" | "upload";
  note?: string;
};

const MB = 1024 * 1024;
const LIMIT = 50 * MB; // Supabase free-tier per-file cap

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
        reject(new Error("This clip is over the 50 MB storage limit."));
      else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(file);
  });
}

/** Upload each clip directly to Supabase Storage. */
export async function uploadScenesToStorage(
  files: File[],
  onProgress: (status: UploadStatus) => void
): Promise<SceneUpload[]> {
  const results: SceneUpload[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const total = files.length;

    if (file.size > LIMIT) {
      throw new Error(
        `"${file.name}" is ${(file.size / MB).toFixed(0)} MB, over the 50 MB limit. ` +
          `Use shorter clips, or ask to enable large-video hosting (Mux) / a bigger storage plan.`
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
      title: file.name.replace(/\.[^.]+$/, ""),
      videoKey: up.key,
      mimeType,
    });
  }
  return results;
}
