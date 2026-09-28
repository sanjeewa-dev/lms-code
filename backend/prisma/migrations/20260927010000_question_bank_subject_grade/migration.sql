-- Question banks keyed by teacher + subject + optional grade

ALTER TABLE "QuestionBank" ADD COLUMN IF NOT EXISTS "subject" TEXT;
ALTER TABLE "QuestionBank" ADD COLUMN IF NOT EXISTS "grade" TEXT NOT NULL DEFAULT '';

-- Backfill subject from owner profile (fallback General)
UPDATE "QuestionBank" qb
SET "subject" = COALESCE(NULLIF(TRIM(u."subject"), ''), 'General')
FROM "User" u
WHERE u."id" = qb."ownerId" AND (qb."subject" IS NULL OR qb."subject" = '');

UPDATE "QuestionBank" SET "subject" = 'General' WHERE "subject" IS NULL OR "subject" = '';

ALTER TABLE "QuestionBank" ALTER COLUMN "subject" SET NOT NULL;

DROP INDEX IF EXISTS "QuestionBank_tenantId_ownerId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "QuestionBank_tenantId_ownerId_subject_grade_key"
  ON "QuestionBank"("tenantId", "ownerId", "subject", "grade");
CREATE INDEX IF NOT EXISTS "QuestionBank_ownerId_subject_idx" ON "QuestionBank"("ownerId", "subject");
