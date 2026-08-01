import "server-only";

// YouTube scheduling for the children's channel. Active when the three OAuth
// env vars are set (see SETUP-YOUTUBE.md). Videos upload as PRIVATE with a
// publishAt time — YouTube flips them public automatically at that moment —
// and are always marked "made for kids" (COPPA) since this is a children's
// channel.

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;

export function isYouTubeConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID as string,
      client_secret: CLIENT_SECRET as string,
      refresh_token: REFRESH_TOKEN as string,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`YouTube auth failed (${res.status}). Check the OAuth env vars.`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Upload a video to the channel, scheduled to go public at `publishAt`.
 * Streams the file from `sourceUrl` (Bunny/Supabase CDN) to YouTube's
 * resumable upload endpoint. Returns the YouTube video id.
 */
export async function scheduleYouTubeUpload(input: {
  title: string;
  description: string;
  sourceUrl: string;
  publishAt: Date;
}): Promise<string> {
  const accessToken = await getAccessToken();

  // 1) start a resumable session with metadata
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: {
          title: input.title.slice(0, 100),
          description: input.description.slice(0, 4900),
        },
        status: {
          privacyStatus: "private",
          publishAt: input.publishAt.toISOString(),
          selfDeclaredMadeForKids: true,
        },
      }),
    }
  );
  if (!init.ok) {
    const detail = await init.text().catch(() => "");
    throw new Error(`YouTube rejected the upload (${init.status}): ${detail}`);
  }
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return an upload URL.");

  // 2) stream the video bytes from storage to YouTube
  const source = await fetch(input.sourceUrl);
  if (!source.ok || !source.body) {
    throw new Error(`Could not read the video from storage (${source.status}).`);
  }
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      ...(source.headers.get("content-length")
        ? { "Content-Length": source.headers.get("content-length") as string }
        : {}),
    },
    body: source.body,
    // @ts-expect-error Node fetch needs duplex for streaming request bodies
    duplex: "half",
  });
  if (!put.ok) {
    const detail = await put.text().catch(() => "");
    throw new Error(`YouTube upload failed (${put.status}): ${detail}`);
  }
  const video = (await put.json()) as { id: string };
  return video.id;
}
