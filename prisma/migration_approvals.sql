-- Reviewer approvals + episode view tracking. Additive; safe live.
-- Run on the production Supabase database before deploying this build.

CREATE TABLE IF NOT EXISTS "EpisodeApproval" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EpisodeApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EpisodeApproval_episodeId_userId_key"
  ON "EpisodeApproval"("episodeId", "userId");
CREATE INDEX IF NOT EXISTS "EpisodeApproval_episodeId_idx" ON "EpisodeApproval"("episodeId");

CREATE TABLE IF NOT EXISTS "EpisodeVisit" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EpisodeVisit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EpisodeVisit_episodeId_userId_key"
  ON "EpisodeVisit"("episodeId", "userId");
CREATE INDEX IF NOT EXISTS "EpisodeVisit_episodeId_idx" ON "EpisodeVisit"("episodeId");

DO $$ BEGIN
  ALTER TABLE "EpisodeApproval" ADD CONSTRAINT "EpisodeApproval_episodeId_fkey"
    FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EpisodeApproval" ADD CONSTRAINT "EpisodeApproval_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EpisodeVisit" ADD CONSTRAINT "EpisodeVisit_episodeId_fkey"
    FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EpisodeVisit" ADD CONSTRAINT "EpisodeVisit_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
