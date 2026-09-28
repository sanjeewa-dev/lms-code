-- Class.subject for question-bank matching

ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "subject" TEXT NOT NULL DEFAULT '';

-- Backfill from teacher profile subject where empty
UPDATE "Class" c
SET "subject" = COALESCE(NULLIF(TRIM(u."subject"), ''), '')
FROM "User" u
WHERE u."id" = c."teacherId" AND (c."subject" IS NULL OR c."subject" = '');
