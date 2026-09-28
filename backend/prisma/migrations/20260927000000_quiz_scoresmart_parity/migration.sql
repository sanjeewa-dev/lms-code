-- Quiz ScoreSmart on-screen parity (topic catalog, bank, runner fields, analytics columns)

-- AlterEnum
ALTER TYPE "FileKind" ADD VALUE IF NOT EXISTS 'question_figure';

-- AlterTable Quiz
ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "navigationMode" TEXT NOT NULL DEFAULT 'bidirectional';
ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "timeRemindersMinutes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "topicMapping" JSONB;

-- AlterTable Question
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "topic" TEXT NOT NULL DEFAULT 'General';
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "quizTopicId" TEXT;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "complexity" TEXT NOT NULL DEFAULT 'not_defined';
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "sourceBankItemId" TEXT;

-- AlterTable QuizAttempt
ALTER TABLE "QuizAttempt" ADD COLUMN IF NOT EXISTS "topicBreakdown" JSONB;
ALTER TABLE "QuizAttempt" ADD COLUMN IF NOT EXISTS "questionScores" JSONB;
ALTER TABLE "QuizAttempt" ADD COLUMN IF NOT EXISTS "displayOrder" JSONB;

-- CreateTable QuizTopic
CREATE TABLE IF NOT EXISTS "QuizTopic" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuizTopic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QuizTopic_tenantId_name_key" ON "QuizTopic"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "QuizTopic_tenantId_idx" ON "QuizTopic"("tenantId");

CREATE TABLE IF NOT EXISTS "QuizTopicClass" (
    "quizTopicId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    CONSTRAINT "QuizTopicClass_pkey" PRIMARY KEY ("quizTopicId","classId")
);
CREATE INDEX IF NOT EXISTS "QuizTopicClass_classId_idx" ON "QuizTopicClass"("classId");

CREATE TABLE IF NOT EXISTS "QuestionImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "fileId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuestionImage_tenantId_idx" ON "QuestionImage"("tenantId");
CREATE INDEX IF NOT EXISTS "QuestionImage_questionId_idx" ON "QuestionImage"("questionId");

CREATE TABLE IF NOT EXISTS "QuestionBank" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'My question bank',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "QuestionBank_tenantId_ownerId_key" ON "QuestionBank"("tenantId", "ownerId");
CREATE INDEX IF NOT EXISTS "QuestionBank_tenantId_idx" ON "QuestionBank"("tenantId");

CREATE TABLE IF NOT EXISTS "QuestionBankItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "topic" TEXT NOT NULL DEFAULT 'General',
    "complexity" TEXT NOT NULL DEFAULT 'not_defined',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionBankItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuestionBankItem_tenantId_idx" ON "QuestionBankItem"("tenantId");
CREATE INDEX IF NOT EXISTS "QuestionBankItem_bankId_idx" ON "QuestionBankItem"("bankId");
CREATE INDEX IF NOT EXISTS "QuestionBankItem_topic_idx" ON "QuestionBankItem"("topic");

CREATE TABLE IF NOT EXISTS "QuestionBankItemImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "fileId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionBankItemImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuestionBankItemImage_tenantId_idx" ON "QuestionBankItemImage"("tenantId");
CREATE INDEX IF NOT EXISTS "QuestionBankItemImage_itemId_idx" ON "QuestionBankItemImage"("itemId");

-- FKs (ignore if already exist)
DO $$ BEGIN
  ALTER TABLE "QuizTopic" ADD CONSTRAINT "QuizTopic_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuizTopic" ADD CONSTRAINT "QuizTopic_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuizTopicClass" ADD CONSTRAINT "QuizTopicClass_quizTopicId_fkey" FOREIGN KEY ("quizTopicId") REFERENCES "QuizTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuizTopicClass" ADD CONSTRAINT "QuizTopicClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Question" ADD CONSTRAINT "Question_quizTopicId_fkey" FOREIGN KEY ("quizTopicId") REFERENCES "QuizTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionImage" ADD CONSTRAINT "QuestionImage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionImage" ADD CONSTRAINT "QuestionImage_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionBankItemImage" ADD CONSTRAINT "QuestionBankItemImage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "QuestionBankItemImage" ADD CONSTRAINT "QuestionBankItemImage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "QuestionBankItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Question_quizTopicId_idx" ON "Question"("quizTopicId");
