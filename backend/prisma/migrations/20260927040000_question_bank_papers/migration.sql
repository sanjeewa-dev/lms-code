-- Question bank paper upload + AI extraction (ScoreSmart parity)

CREATE TYPE "PaperExtractionStatus" AS ENUM ('pending', 'processing', 'pending_review', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS "QuestionBankPaper" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL DEFAULT 'image',
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "sidecar" JSONB,
    "extractionStatus" "PaperExtractionStatus" NOT NULL DEFAULT 'pending',
    "draftItems" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionBankPaper_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuestionBankPaper_tenantId_idx" ON "QuestionBankPaper"("tenantId");
CREATE INDEX IF NOT EXISTS "QuestionBankPaper_bankId_idx" ON "QuestionBankPaper"("bankId");
CREATE INDEX IF NOT EXISTS "QuestionBankPaper_extractionStatus_idx" ON "QuestionBankPaper"("extractionStatus");

DO $$ BEGIN
  ALTER TABLE "QuestionBankPaper" ADD CONSTRAINT "QuestionBankPaper_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionBankPaper" ADD CONSTRAINT "QuestionBankPaper_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionBankPaper" ADD CONSTRAINT "QuestionBankPaper_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
