import "server-only";
import { createHash } from "node:crypto";

// Bunny Stream video backend. Active when the three env vars are set; videos
// then upload straight from the browser to Bunny via signed TUS (the API key
// never leaves the server) and stream from Bunny's CDN with no size cap.
// Scene.videoFile stores "bunny:<videoId>" so Bunny and Supabase clips coexist.

const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID;
const API_KEY = process.env.BUNNY_STREAM_API_KEY;
const CDN_HOST = process.env.BUNNY_STREAM_CDN_HOST; // e.g. vz-xxxxx.b-cdn.net

const API_BASE = "https://video.bunnycdn.com";

export const BUNNY_PREFIX = "bunny:";

export function isBunnyStorage(): boolean {
  return Boolean(LIBRARY_ID && API_KEY && CDN_HOST);
}

export function isBunnyKey(key: string): boolean {
  return key.startsWith(BUNNY_PREFIX);
}

export function bunnyVideoIdFromKey(key: string): string {
  return key.slice(BUNNY_PREFIX.length);
}

export type BunnyUploadTicket = {
  videoId: string;
  libraryId: string;
  signature: string;
  expiration: number;
};

/** Create the video object and presign a TUS upload for the browser. */
export async function createBunnyUpload(title: string): Promise<BunnyUploadTicket> {
  const res = await fetch(`${API_BASE}/library/${LIBRARY_ID}/videos`, {
    method: "POST",
    headers: { AccessKey: API_KEY as string, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Could not start the video upload (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { guid: string };
  const expiration = Math.floor(Date.now() / 1000) + 60 * 60; // 1h to finish
  const signature = createHash("sha256")
    .update(`${LIBRARY_ID}${API_KEY}${expiration}${data.guid}`)
    .digest("hex");
  return {
    videoId: data.guid,
    libraryId: LIBRARY_ID as string,
    signature,
    expiration,
  };
}

export type BunnyVideoState = {
  ready: boolean;
  /** Direct-playback MP4 URL for the best available rendition (when ready). */
  mp4Url: string | null;
};

/**
 * Look up a video's encoding state and best MP4-fallback rendition.
 * status 3 = finished, 4 = ready/resolution-finished (Bunny's lifecycle).
 */
export async function getBunnyVideoState(videoId: string): Promise<BunnyVideoState> {
  try {
    const res = await fetch(`${API_BASE}/library/${LIBRARY_ID}/videos/${videoId}`, {
      headers: { AccessKey: API_KEY as string },
      next: { revalidate: 15 },
    });
    if (!res.ok) return { ready: false, mp4Url: null };
    const v = (await res.json()) as {
      status: number;
      availableResolutions: string | null;
    };
    const resolutions = (v.availableResolutions ?? "")
      .split(",")
      .map((r) => parseInt(r, 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => b - a);
    if (v.status >= 3 && resolutions.length > 0) {
      return {
        ready: true,
        mp4Url: `https://${CDN_HOST}/${videoId}/play_${resolutions[0]}p.mp4`,
      };
    }
    return { ready: false, mp4Url: null };
  } catch {
    return { ready: false, mp4Url: null };
  }
}

/** Delete Bunny videos (best effort), given mixed storage keys. */
export async function deleteBunnyVideos(keys: string[]): Promise<void> {
  await Promise.all(
    keys.filter(isBunnyKey).map((key) =>
      fetch(`${API_BASE}/library/${LIBRARY_ID}/videos/${bunnyVideoIdFromKey(key)}`, {
        method: "DELETE",
        headers: { AccessKey: API_KEY as string },
      }).catch(() => {})
    )
  );
}
