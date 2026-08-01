import { createSignedUploadAction } from "@/lib/actions";
import { compressVideo } from "@/lib/compressVideo";

export type SceneUpload = { title: string; videoKey: string; mimeType: string };

export type UploadStatus = {
  index: number;
  total: number;
  pct: number;
  phase: "compress" | "upload";
  note?: string;
};

const MB = 1024 * 1024;
const CLOUD_LIMIT = 50 * MB; // Supabase free-tier per-file cap
const UPLOAD_RETRIES = 3;

function xhrSend(
  url: string,
  method: "PUT" | "POST",
  body: File | FormData,
  contentType: string | null,
  onPct: (n: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (contentType) xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
      else if (xhr.status === 413)
        reject(
          Object.assign(new Error("This clip is over the 50 MB storage limit."), {
            permanent: true,
          })
        );
      else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(body);
  });
}

/** Retry transient upload failures; flaky Wi-Fi shouldn't lose a whole batch. */
async function sendWithRetry(
  attempt: () => Promise<string>,
  onRetry: (n: number) => void
): Promise<string> {
  let lastError: Error = new Error("Upload failed.");
  for (let tryNo = 1; tryNo <= UPLOAD_RETRIES; tryNo++) {
    try {
      return await attempt();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Upload failed.");
      if ((lastError as { permanent?: boolean }).permanent) throw lastError;
      if (tryNo < UPLOAD_RETRIES) {
        onRetry(tryNo);
        await new Promise((r) => setTimeout(r, 1500 * tryNo));
      }
    }
  }
  throw lastError;
}

/**
 * Compress (in-browser, WebCodecs) then upload each clip. Cloud → direct PUT to
 * Supabase Storage via signed URL; local dev → POST to /api/upload. Reports
 * per-clip progress for both phases.
 */
export async function uploadScenesToStorage(
  files: File[],
  onProgress: (status: UploadStatus) => void,
  cloud: boolean = true
): Promise<SceneUpload[]> {
  const results: SceneUpload[] = [];
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const original = files[i];

    // --- compress phase ---
    onProgress({ index: i, total, pct: 0, phase: "compress" });
    const { file, compressed, note } = await compressVideo(original, (pct) =>
      onProgress({ index: i, total, pct, phase: "compress" })
    );
    if (compressed) {
      const savedPct = Math.round((1 - file.size / original.size) * 100);
      onProgress({
        index: i,
        total,
        pct: 100,
        phase: "compress",
        note: `${(original.size / MB).toFixed(0)} MB → ${(file.size / MB).toFixed(
          1
        )} MB (${savedPct}% smaller)`,
      });
    }

    // --- pre-flight: reject before wasting an upload ---
    if (cloud && file.size > CLOUD_LIMIT) {
      throw new Error(
        `"${original.name}" is still ${(file.size / MB).toFixed(0)} MB after ` +
          `compression — over the 50 MB storage limit. Split it into shorter ` +
          `clips, or ask about large-video hosting.` +
          (note ? ` (${note})` : "")
      );
    }

    // --- upload phase ---
    onProgress({ index: i, total, pct: 0, phase: "upload" });
    const mimeType = file.type || "video/mp4";
    let key: string;

    if (cloud) {
      const up = await createSignedUploadAction({
        filename: file.name,
        contentType: mimeType,
      });
      if (!up.ok || !up.uploadUrl || !up.key) {
        throw new Error(up.error || "Could not start upload.");
      }
      await sendWithRetry(
        () =>
          xhrSend(up.uploadUrl as string, "PUT", file, mimeType, (pct) =>
            onProgress({ index: i, total, pct, phase: "upload" })
          ),
        (n) =>
          onProgress({
            index: i,
            total,
            pct: 0,
            phase: "upload",
            note: `connection hiccup — retrying (${n + 1}/${UPLOAD_RETRIES})`,
          })
      );
      key = up.key;
    } else {
      const form = new FormData();
      form.append("file", file, file.name);
      const responseText = await sendWithRetry(
        () =>
          xhrSend("/api/upload", "POST", form, null, (pct) =>
            onProgress({ index: i, total, pct, phase: "upload" })
          ),
        (n) =>
          onProgress({
            index: i,
            total,
            pct: 0,
            phase: "upload",
            note: `connection hiccup — retrying (${n + 1}/${UPLOAD_RETRIES})`,
          })
      );
      const parsed = JSON.parse(responseText) as { key?: string; error?: string };
      if (!parsed.key) throw new Error(parsed.error || "Upload failed.");
      key = parsed.key;
    }

    results.push({
      title: original.name.replace(/\.[^.]+$/, ""),
      videoKey: key,
      mimeType,
    });
  }
  return results;
}
