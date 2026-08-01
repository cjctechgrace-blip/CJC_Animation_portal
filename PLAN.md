# CJC Animation Portal — Improvement Plan

_Created: 2026-08-01. Owner: Grace (cjctechgrace@gmail.com)._

Goal: make the portal **foolproof for teammates** (great upload/review experience,
real accounts, clear accountability) and **cheap at scale** (compressed video,
low-cost storage with no file-size ceiling).

Tooling note: Supabase and Vercel are managed via their **MCP servers**
(already connected in Claude Code) — database migrations, logs, deploys, and env
vars can be driven directly. Bunny Stream has no MCP; it is driven via its REST
API from code. GitHub via the `gh` CLI.

---

## Phase 0 — Security & foundations (do first, ~an hour)

| # | Task | How |
|---|---|---|
| 0.1 | Rotate Supabase DB password + `service_role` key (were shared in chat during setup; repo is public) | Supabase dashboard → Settings; then update Vercel env via Vercel MCP |
| 0.2 | Connect GitHub repo → Vercel for push-to-deploy | Vercel dashboard (one-time) |
| 0.3 | Run Supabase security advisors, fix findings | Supabase MCP `get_advisors` |
| 0.4 | Add login rate-limiting (public endpoint) | small code change in `actions.ts` |

## Phase 1 — Foolproof uploads + in-browser compression (no new accounts, free)

The 50 MB rejections and heavy uploads are the biggest UX pain. Fix in the browser:

- **1.1 WebCodecs compression** in the upload form (Mediabunny or similar):
  re-encode to 1080p H.264 at review-quality bitrate before upload. Typical
  5–10× size reduction; hardware-accelerated, unlike the old ffmpeg.wasm attempt.
- **1.2 Foolproof upload UX**: per-file progress bars, pause/resume-safe retry on
  flaky connections, clear pre-flight validation ("this clip will be ~34 MB after
  compression ✓") instead of post-upload rejection, drag-and-drop polish.
- **1.3 Fallback path**: if the browser lacks WebCodecs (old Safari/Firefox),
  upload the original with a size warning rather than failing.
- **1.4 E2E tests** for the new upload path (Playwright suite already exists).

**Exit criteria:** a raw phone clip uploads compressed, with progress, and never
hits the 50 MB wall.

## Phase 2 — Storage that scales at minimal cost (Bunny Stream)

- **2.1 Grace creates a Bunny.net account** (only manual step; pay-as-you-go,
  ~$0.005/GB/mo storage + ~$0.005/GB delivery → a 100 GB library ≈ $1–2/mo).
- **2.2 Swap the video path in `src/lib/storage.ts`** to Bunny Stream via its
  REST API (direct browser upload, like today's Supabase flow). Supabase Storage
  keeps handling small assets (annotation frames, thumbnails).
- **2.3 Adaptive streaming player**: Bunny auto-transcodes to multiple qualities;
  switch the player to HLS so scrubbing is smooth on any connection.
- **2.4 Migration script** for existing episodes (Supabase → Bunny), then delete
  from Supabase to free the 1 GB tier.
- **2.5 Delete-cascade update** so removing scenes/episodes also purges Bunny.

**Exit criteria:** no file-size ceiling; smooth adaptive playback; storage bill
in single-digit dollars.

## Phase 3 — Team accounts & accountability

- **3.1 Admin "Team" page**: invite by email (one-time invite link where the
  person sets their own password), list/deactivate members, reset passwords.
- **3.2 Role enforcement**: destructive actions (delete project/episode/scene,
  delete others' comments) require admin or ownership. `role` field already
  exists; add checks in `actions.ts`.
- **3.3 Attribution everywhere**: record uploader on scenes/episodes (authors are
  already recorded on comments/posts); per-episode activity feed
  ("Grace resolved note at 0:42").
- **3.4 Retire shared test accounts** once real invites work.

**Exit criteria:** every teammate has their own login; every action shows who
did it; only the right people can delete things.

## Phase 4 — Experience polish (after the above ships)

- **4.1 Realtime** — replace 10 s polling with Supabase Realtime (already on
  Supabase; makes co-review feel live).
- **4.2 Notifications** — email on reply/@mention (e.g. Resend free tier).
- **4.3 Mobile pass** — review + comment flows on phones.
- **4.4 Later / bigger**: rendered `.mp4` exports from the editor (Bunny/Mux),
  scene version compare (v1 vs v2 side-by-side), custom domain.

---

## Sequencing & effort

| Phase | Depends on | Rough effort |
|---|---|---|
| 0 Security | — | ~1 hour (mostly dashboard clicks) |
| 1 Compression | — | 1 session of work |
| 2 Bunny Stream | Grace's Bunny account | 1–2 sessions + migration |
| 3 Team & roles | — | 1–2 sessions |
| 4 Polish | 0–3 | incremental |

Phases 1 and 3 are independent — either can start immediately. Phase 2 is the
only one needing a new external account.
