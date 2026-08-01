# Connecting the YouTube channel (one-time setup)

The publishing board can upload approved episodes to your children's YouTube
channel automatically: the video uploads **private** with a scheduled
`publishAt`, marked **made for kids** (COPPA), and YouTube flips it public at
the scheduled time. To enable it, the app needs three environment variables.

## 1. Create Google OAuth credentials (~10 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   create a project (e.g. "CJC Portal").
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **APIs & Services → OAuth consent screen** → External → fill the app name +
   your email → add scope `https://www.googleapis.com/auth/youtube.upload` →
   add your Google account (the one that owns the channel) as a **test user**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   type **Web application** → add redirect URI
   `https://developers.google.com/oauthplayground` → note the
   **Client ID** and **Client secret**.

## 2. Get a refresh token

1. Open [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground).
2. Click the ⚙️ (top right) → check **Use your own OAuth credentials** → paste
   the Client ID + secret.
3. In the left list, enter scope `https://www.googleapis.com/auth/youtube.upload`
   → **Authorize APIs** → sign in with the channel's Google account (make sure
   to pick the **channel** identity if asked).
4. Click **Exchange authorization code for tokens** → copy the
   **Refresh token**.

## 3. Add the env vars

In **Vercel → Project → Settings → Environment Variables** (and in
`.env.production.local` for local testing):

```
YOUTUBE_CLIENT_ID=...apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
```

Redeploy. The board's Schedule form will now say it uploads to YouTube.

## Notes & limits

- **Single-clip episodes only.** A multi-scene episode has no single final
  file; give it one final-cut clip (a single scene with video) and it will
  auto-post. Multi-scene episodes can still be *scheduled* — you just post
  them to YouTube manually.
- Every upload is marked **made for kids** — no comments, no personalized
  ads, per YouTube's children's-content rules.
- While the OAuth consent screen is in "Testing" mode, refresh tokens expire
  after 7 days. Publish the consent screen (it only needs the upload scope and
  your own channel) to make the token long-lived.
- Unscheduling an episode that's already queued on YouTube must be done in
  **YouTube Studio** (the board will tell you).

## Bunny Stream env (same place)

```
BUNNY_STREAM_LIBRARY_ID=718455
BUNNY_STREAM_API_KEY=      # Bunny dashboard → Stream → CJC Animation Portal → API
BUNNY_STREAM_CDN_HOST=     # e.g. vz-xxxxxxxx-xxx.b-cdn.net (same API page, "CDN hostname")
```

With these set, new uploads bypass Supabase's 50 MB cap and stream from
Bunny's CDN. Existing Supabase clips keep working side by side.
