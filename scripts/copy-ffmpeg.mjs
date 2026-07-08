// Copy the ffmpeg.wasm single-thread core into /public so the browser can load
// it same-origin (no CDN, no CSP/COEP headaches). Runs during build.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dist = join("node_modules", "@ffmpeg", "core", "dist", "umd");
const out = join("public", "ffmpeg");
mkdirSync(out, { recursive: true });

for (const f of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const src = join(dist, f);
  if (!existsSync(src)) {
    console.error(`[copy-ffmpeg] missing ${src} — is @ffmpeg/core installed?`);
    process.exit(1);
  }
  copyFileSync(src, join(out, f));
}
console.log("[copy-ffmpeg] core copied to public/ffmpeg");
