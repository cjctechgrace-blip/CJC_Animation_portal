-- Publishing pipeline (Kanban board + YouTube scheduling). Additive; safe live.
-- Run on the production Supabase database before deploying this build.

ALTER TABLE "Episode" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'review';
ALTER TABLE "Episode" ADD COLUMN IF NOT EXISTS "publishAt" TIMESTAMP(3);
ALTER TABLE "Episode" ADD COLUMN IF NOT EXISTS "youtubeVideoId" TEXT;
CREATE INDEX IF NOT EXISTS "Episode_status_idx" ON "Episode"("status");

-- Roles are now "admin" | "editor" | "reviewer". Existing "member" rows keep
-- working (treated as reviewer, the lowest privilege). Promote your video
-- editors on the /team page after deploying, or run e.g.:
--   UPDATE "User" SET "role" = 'editor' WHERE "email" = 'editor@cjc.test';
