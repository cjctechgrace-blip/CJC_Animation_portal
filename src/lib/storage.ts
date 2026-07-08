import "server-only";
import path from "node:path";
import fs from "node:fs";

// Local media store. In production this whole module is replaced by Mux
// (direct uploads + streaming), keeping the rest of the app unchanged.
export const STORAGE_DIR = path.join(process.cwd(), "storage");

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

/** Save a `data:image/png;base64,...` URL to storage and return the filename. */
export function saveDataUrlPng(dataUrl: string, baseName: string): string | null {
  const match = /^data:image\/png;base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  ensureStorage();
  const fileName = `${baseName}.png`;
  const buffer = Buffer.from(match[1], "base64");
  fs.writeFileSync(storagePathFor(fileName), buffer);
  return fileName;
}
