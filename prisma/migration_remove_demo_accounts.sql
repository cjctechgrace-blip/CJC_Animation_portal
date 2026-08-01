-- Deactivate the publicly-documented demo/test accounts on PRODUCTION.
-- (Deactivation keeps their history attributed; they can no longer sign in.)
-- Run in the Supabase SQL editor after deploying the build that hides the
-- demo-accounts hint on the login page.

UPDATE "User" SET "active" = false
WHERE "email" IN ('admin@cjc.test', 'editor@cjc.test', 'reviewer@cjc.test');

-- Also kill any of their live sessions:
DELETE FROM "Session" WHERE "userId" IN (
  SELECT "id" FROM "User"
  WHERE "email" IN ('admin@cjc.test', 'editor@cjc.test', 'reviewer@cjc.test')
);

-- To add a real admin (e.g. Oliyaddeyasa@gmail.com): DON'T insert a password
-- hash by hand. Sign in to the live app as an existing admin → /team →
-- "Invite teammate" → role: Admin → send them the link; they choose their own
-- password. Passwords should never travel through chat or SQL.
