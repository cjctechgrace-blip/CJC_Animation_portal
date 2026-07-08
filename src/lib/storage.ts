import "server-only";
import path from "node:path";
import fs from "node:fs";

// Media store. In production (SUPABASE_* env present) files go to Supabase
// Storage; locally they go to ./storage on disk. The rest of the app is
// unchanged — it just persists/reads an opaque storage id.
export const STORAGE_DIR = path.join(process.cwd(), "storage");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "media";

export function isCloudStorage(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

export function ensureStorage(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export function storagePathFor(fileName: string): string {
  // guard against path traversal — only allow a bare filename
  const safe = path.basename(fileName);
  return path.join(STORAGE_DIR, safe);
}

const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
};

export function extensionFor(mime: string, fallbackName: string): string {
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  const fromName = path.extname(fallbackName).replace(".", "");
  return fromName || "mp4";
}

/** Public URL for a cloud object key. */
export function publicUrl(key: string): string {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encoded}`;
}

/**
 * Store bytes and return the id to persist in the DB.
 * Cloud → "<prefix>/<filename>" object key; local → bare "<filename>".
 */
export async function putMedia(
  prefix: string,
  filename: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  if (isCloudStorage()) {
    const key = `${prefix}/${filename}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY as string,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: new Uint8Array(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Supabase upload failed (${res.status}): ${detail}`);
    }
    return key;
  }
  ensureStorage();
  fs.writeFileSync(storagePathFor(filename), body);
  return filename;
}

/**
 * Create a one-time signed URL the browser can PUT a file to directly,
 * bypassing the app server (avoids Vercel's ~4.5MB function body limit).
 * Cloud only.
 */
export async function createSignedUpload(
  prefix: string,
  filename: string
): Promise<{ uploadUrl: string; key: string }> {
  const key = `${prefix}/${filename}`;
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${key}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY as string,
      },
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Could not start upload (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { url: string };
  return { uploadUrl: `${SUPABASE_URL}/storage/v1${data.url}`, key };
}

/** Save a `data:image/png;base64,...` URL and return its stored id. */
export async function saveDataUrlPng(
  dataUrl: string,
  baseName: string
): Promise<string | null> {
  const match = /^data:image\/png;base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  return putMedia("frames", `${baseName}.png`, buffer, "image/png");
}
