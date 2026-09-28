-- Question bank file attachments (images / Word / PDF)

ALTER TYPE "FileKind" ADD VALUE IF NOT EXISTS 'question_bank';

CREATE TABLE IF NOT EXISTS "QuestionBankAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionBankAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuestionBankAttachment_tenantId_idx" ON "QuestionBankAttachment"("tenantId");
CREATE INDEX IF NOT EXISTS "QuestionBankAttachment_bankId_idx" ON "QuestionBankAttachment"("bankId");
CREATE INDEX IF NOT EXISTS "QuestionBankAttachment_fileId_idx" ON "QuestionBankAttachment"("fileId");

DO $$ BEGIN
  ALTER TABLE "QuestionBankAttachment" ADD CONSTRAINT "QuestionBankAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionBankAttachment" ADD CONSTRAINT "QuestionBankAttachment_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionBankAttachment" ADD CONSTRAINT "QuestionBankAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
