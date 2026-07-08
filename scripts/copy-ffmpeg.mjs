// Copy the ffmpeg.wasm UMD build + single-thread core into /public so the browser
// can load it via a plain <script> (publicPath resolves to /ffmpeg/ for the worker).
// This sidesteps Next's bundler, which mishandles ffmpeg's module worker.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const out = join("public", "ffmpeg");
mkdirSync(out, { recursive: true });

const files = [
  ["node_modules/@ffmpeg/core/dist/umd", "ffmpeg-core.js"],
  ["node_modules/@ffmpeg/core/dist/umd", "ffmpeg-core.wasm"],
  ["node_modules/@ffmpeg/ffmpeg/dist/umd", "ffmpeg.js"],
  ["node_modules/@ffmpeg/ffmpeg/dist/umd", "814.ffmpeg.js"],
];

for (const [dir, f] of files) {
  const src = join(dir, f);
  if (!existsSync(src)) {
    console.error(`[copy-ffmpeg] missing ${src}`);
    process.exit(1);
  }
  copyFileSync(src, join(out, f));
}
console.log("[copy-ffmpeg] ffmpeg core + umd copied to public/ffmpeg");
