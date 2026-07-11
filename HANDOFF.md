# CJC Animation Portal — Handoff Document

_Last updated: 2026-07-08_

A team video-review & collaboration portal for AI-animated episodes — the
Frame.io pattern (log in, watch, pin feedback to an exact moment) tailored for a
scene-by-scene AI-animation workflow, plus a lightweight non-destructive editor
and a per-episode discussion board. **Live and in use.**

---

## 1. Live app & how to log in

- **URL:** https://cjc-animation-portal.vercel.app
- **Sign-in is invite-only** (no public signup).
- **Accounts (created during setup):**
  - `cjctechgrace@gmail.com` — **admin** (password set during setup; see §6)
  - `editor@cjc.test` / `password123` — member (test)
  - `reviewer@cjc.test` / `password123` — member (test)

> Any logged-in user (admin or member) can do everything — annotate, edit,
> post, delete. There are no per-role restrictions yet.

---

## 2. What the app does (full feature list)

**Structure:** Projects → Episodes → **Scenes** (each scene = one short clip) → per-scene review.

- **Auth:** invite-only login, bcrypt passwords, database-backed sessions.
- **Upload:** multi-clip / whole-folder upload that goes **straight to storage**
  from the browser (bypasses the host's request-size limit). Short clips fit the
  free storage tier.
- **Scenes:** drag-to-reorder; delete scenes.
- **Timestamped notes:** pause on a frame, pin a note to that exact moment; click
  a note to jump the player back there.
- **Region/spot markers:** drag a box or click a spot on the video and attach it
  to a note. The highlight shows on the video **only when that note is opened**.
- **Threaded replies**, **resolve/reopen**, and **delete** on every note.
- **Save frame:** download the current frame as a PNG.
- **"Make prompt":** turns a note (+ its frame) into a **Higgsfield**-format
  generation prompt via Claude (works out of the box with a built-in template;
  set an API key for the live model — see §6).
- **Episode discussion board** (always visible at the bottom of each episode):
  Reddit-style posts + threaded replies, **upvotes**, and **`@scene#` mentions**
  that let you multi-select that scene's annotations and attach them as clickable
  chips that jump to the scene + annotation.
- **Non-destructive video editor** (✂ scissor toggle on each scene): a mini
  timeline to **trim, reorder, merge multiple clips, and mute**; **named edit
  versions** (switch / new / delete); **Original / Edit / Compare** playback.
  Edits are live "recipes" that play the originals — nothing is re-rendered.
- **Live updates:** notes/posts from teammates appear automatically (~10s
  refresh); your own actions update instantly.
- **Delete:** scenes, episodes, and whole **projects** — all cascade and **free
  the storage** they used.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| App + hosting | **Next.js 14 (App Router)** on **Vercel** |
| Database | **Supabase Postgres** via **Prisma** |
| File storage | **Supabase Storage** (public bucket `media`) |
| Auth | Custom (bcrypt + DB sessions) — no third-party auth |
| AI prompts | **Claude API** (optional) |

---

## 4. Accounts & infrastructure

- **GitHub:** `github.com/cjctechgrace-blip/CJC_Animation_portal` (currently
  **public**). Write access granted to GitHub user `karlagli791`.
- **Vercel:** project `cjc-animation-portal` under **karlagli791's** team.
  Deployed via the Vercel CLI. The GitHub repo is **not** auto-connected —
  connecting it in Vercel would enable push-to-deploy.
- **Supabase:** project ref `syvtyoinannqrgqbiutk` (its own account, separate
  from the "CJC Tech Grace" org). Postgres + Storage bucket `media` (public).

---

## 5. Repository layout (orientation)

```
prisma/
  schema.prisma            # SQLite schema (local dev)
  schema.postgres.prisma   # Postgres schema (Supabase / production)
  seed.ts                  # seeds demo users + a demo episode
src/
  lib/
    db.ts                  # Prisma client
    auth.ts                # sessions, login/logout, requireUser
    actions.ts             # ALL server actions (auth, projects, episodes,
                           #   scenes, comments, edits, discussion, deletes)
    storage.ts             # upload / signed-URL / public-URL / delete (cloud+local)
    prompt.ts              # Higgsfield prompt (Claude or template)
    uploadScenes.ts        # browser -> Supabase direct upload
  app/
    login/ dashboard/ projects/[projectId]/ episodes/[episodeId]/
    episodes/[episodeId]/  # the heart of the app:
      EpisodeView, SceneReview, EditPlayer, SceneEditor, SceneCompare,
      EpisodeDiscussion, AddScenesForm, Delete*Button, api/ (video, frame, upload)
vercel.json                # Vercel build command (uses the Postgres schema)
```

---

## 6. Environment variables (⚠️ secrets)

The app reads these. **Actual values live in `.env.production.local`** (on the
dev machine — git-ignored) **and in Vercel → Project → Settings → Environment
Variables**. They are intentionally NOT in this file because the repo is public.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** (IPv4) connection string |
| `DIRECT_URL` | Supabase **session pooler** (for migrations) |
| `SUPABASE_URL` | `https://syvtyoinannqrgqbiutk.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key (Settings → API) — **secret** |
| `SUPABASE_STORAGE_BUCKET` | `media` |
| `ANTHROPIC_API_KEY` | _(optional)_ enables the real Claude model for prompts |

> **CRITICAL — must use the IPv4 pooler host.** `DATABASE_URL` must point at the
> regional pooler `aws-1-us-east-2.pooler.supabase.com:6543` (username
> `postgres.syvtyoinannqrgqbiutk`, add `?pgbouncer=true`). The `db.<ref>.supabase.co`
> host is **IPv6-only** and Vercel **cannot reach it** → server errors.

> **SECURITY:** the database password and `service_role` key were shared in chat
> during setup. **Rotate both** in the Supabase dashboard (Settings → Database
> for the password, Settings → API to rotate the key) and update the two env
> vars in Vercel + `.env.production.local`.

---

## 7. Local development

```bash
npm install                 # first time (approves ffmpeg/prisma install scripts if prompted)
# Option A — fully local (SQLite, zero cloud):
npm run db:reset            # create + seed a local database
npm run dev                 # http://localhost:3000  (login: admin@cjc.test / password123)

# Option B — against real Supabase:
#   put the Supabase env in .env.production.local, then:
npm run build && npm start
```

Two Prisma schemas coexist: **SQLite** for local (`schema.prisma`), **Postgres**
for production (`schema.postgres.prisma`). Vercel's build uses the Postgres one
(see `vercel.json`).

---

## 8. Deploying

```bash
# Needs a Vercel token/login for karlagli791's team:
npx vercel deploy --prod --scope karlagli791s-projects
```

Database schema changes are applied **additively** to Supabase (new tables /
`ADD COLUMN`), because destructive changes on the production DB are blocked.

---

## 9. Known limitations & decisions

- **Storage size:** Supabase **free tier = 50 MB/file, 1 GB total**. Clips over
  50 MB are rejected with guidance. In-browser compression (ffmpeg.wasm) was
  attempted but does **not** run reliably in this host → reverted. For real large
  video, the path is **Mux** (recommended; what Frame.io uses) or **Supabase Pro**.
- **Video editor is non-destructive** — edits are live recipes, not rendered
  files. No downloadable new `.mp4` yet, and "extract audio" = **mute**. Real
  rendered exports would need Mux.
- **Live updates** use ~10s polling, not true realtime sockets.
- **Delete** frees storage immediately, but Supabase's CDN may serve a
  just-deleted public URL from cache for a short while.

---

## 10. Suggested next steps

1. **Rotate the exposed secrets** (DB password + service_role key). _(do first)_
2. Point a **custom domain** at the Vercel project.
3. **Connect the GitHub repo to Vercel** for automatic deploys on push.
4. Decide on **large-video hosting** (Mux or Supabase Pro) if episodes exceed 50 MB.
5. Add an **"invite/add member" admin UI** + password reset (today, users are
   added by seeding/inserting a DB row).
6. Add `ANTHROPIC_API_KEY` in Vercel to switch prompts to the live Claude model.
7. Optionally: rendered exports, true realtime, and role-based permissions on
   destructive actions.
8. Refresh the `README.md` (it predates most of these features).

---

## 11. Gotchas for whoever works on this next

- **npm 11.16** blocks dependency install scripts → run `npm approve-scripts`
  (already recorded under `allowScripts` in `package.json`).
- The project folder is under **OneDrive**, which occasionally locks the Prisma
  engine (EPERM); `db:reset` uses `--skip-generate` to sidestep it. Consider
  moving the repo to a non-synced path (e.g. `C:\dev\`).
- Supabase **direct 5432 is IPv6-only/flaky** — always use the IPv4 pooler (§6).
- After a delete that redirects, call `router.refresh()` or the destination shows
  a **stale cached list**.
- Timestamps use `suppressHydrationWarning` (server timezone vs browser timezone
  would otherwise cause React hydration errors).
- `EpisodeView` caches scene data in state; its re-sync signature must include
  comment/edit changes or the list goes stale after a refresh.

---

_Built with Claude Code. This document is safe to commit (contains no secrets)._
