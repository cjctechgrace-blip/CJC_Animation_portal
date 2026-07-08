# CJC Animation Portal

A team review & feedback portal for animated episodes — the Frame.io-style
pattern (log in, watch, pin comments to an exact moment) tailored for an
AI-animation workflow. **Phase 1** is built and fully e2e-tested locally.

## What works today (Phase 1 + 2)

- **Invite-only login** — accounts are seeded/created by an admin, no open signup.
- **Projects → Episodes** — create projects, upload episode videos.
- **Video streaming** with HTTP Range support, so scrubbing/seeking is smooth.
- **Timestamped feedback** — pause on a frame, pin a note to that exact moment.
- **Click a note to jump** the player back to that moment.
- **Threaded replies** and **resolve / reopen** on every note.
- **Draw on the frame** — capture the current frame, circle/mark the exact spot; the
  annotated frame is stored with the note and becomes the AI start-frame.
- **"Make prompt"** — turn a note (+ its frame) into a ready-to-use **Higgsfield**
  generation prompt via Claude, with one-click copy. Works out of the box with a
  built-in template; set `ANTHROPIC_API_KEY` to switch to the real Claude model.

## AI configuration (optional)

The "Make prompt" button works with no setup (deterministic template). To use Claude:

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...        # enables the real model + frame vision
ANTHROPIC_MODEL=claude-opus-4-8      # default; set to claude-haiku-4-5 to cut cost
```

## Run it locally

```bash
npm install            # first time only
npm run db:reset       # create + seed the local database (3 demo users, 1 demo episode)
npm run dev            # start the app at http://localhost:3000
```

### Demo accounts (password: `password123`)

| Email             | Role   |
| ----------------- | ------ |
| admin@cjc.test    | admin  |
| editor@cjc.test   | member |
| reviewer@cjc.test | member |

## Run the tests

```bash
npm run test:e2e       # Playwright: drives login, upload, pin note, seek, reply, resolve
```

## Tech (all Vercel-friendly)

- **Next.js 14** (App Router) — the app + hosting target (Vercel).
- **Prisma + SQLite** locally. To move to **Supabase/Postgres**, change the
  `provider` in `prisma/schema.prisma` to `postgresql` and point `DATABASE_URL`
  at the Supabase connection string — no app code changes.
- **Local file storage** for video (`src/lib/storage.ts`). In production this
  module is swapped for **Mux** (direct uploads + streaming) without touching
  the UI.
- **Claude API** — planned for Phase 2 ("turn a note + its frame into a
  generation prompt").

## Roadmap

- **P1 (done):** login, projects/episodes, upload, timestamped comments, replies, resolve.
- **P2 (done):** draw on the frame, frame-grab, and the Claude "Make prompt" button (Higgsfield format).
- **P3:** scene-assembly timeline (reorder/trim/swap clips), team co-editing.
- **P4:** deeper editing, versions/compare, in-portal generation.
