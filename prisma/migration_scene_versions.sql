-- Scene versions (before/after comparison for re-uploaded clips). Additive.
-- Run on the production Supabase database BEFORE deploying this build.

CREATE TABLE IF NOT EXISTS "SceneVersion" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "videoFile" TEXT NOT NULL,
    "mimeType" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SceneVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SceneVersion_sceneId_versionNo_key"
  ON "SceneVersion"("sceneId", "versionNo");
CREATE INDEX IF NOT EXISTS "SceneVersion_sceneId_idx" ON "SceneVersion"("sceneId");

DO $$ BEGIN
  ALTER TABLE "SceneVersion" ADD CONSTRAINT "SceneVersion_sceneId_fkey"
    FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SceneVersion" ADD CONSTRAINT "SceneVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
