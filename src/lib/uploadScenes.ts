import { createSignedUploadAction } from "@/lib/actions";

export type SceneUpload = { title: string; videoKey: string; mimeType: string };

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
        reject(
          new Error(
            "A clip is over the 50 MB limit on the current Supabase plan. Use shorter clips, or upgrade Supabase storage."
          )
        );
      else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(file);
  });
}

/** Upload each clip directly to Supabase Storage; returns scene inputs. */
export async function uploadScenesToStorage(
  files: File[],
  onProgress: (index: number, total: number, pct: number) => void
): Promise<SceneUpload[]> {
  const results: SceneUpload[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const mimeType = file.type || "video/mp4";
    onProgress(i, files.length, 0);
    const up = await createSignedUploadAction({
      filename: file.name,
      contentType: mimeType,
    });
    if (!up.ok || !up.uploadUrl || !up.key) {
      throw new Error(up.error || "Could not start upload.");
    }
    await putWithProgress(up.uploadUrl, file, mimeType, (pct) =>
      onProgress(i, files.length, pct)
    );
    results.push({
      title: file.name.replace(/\.[^.]+$/, ""),
      videoKey: up.key,
      mimeType,
    });
  }
  return results;
}
