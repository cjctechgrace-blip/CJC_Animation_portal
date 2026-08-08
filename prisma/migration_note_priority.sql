-- Note priority (2026-08-07): reviewers score each note 1-5
-- ("how big a deal is this?"). Team acts on 4-5s first; below 3 is parked.
-- Additive; safe to run on live data. Run in the Supabase SQL editor
-- before deploying the build that includes this feature.

ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "priority" INTEGER;
