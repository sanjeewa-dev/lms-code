-- Password reset tokens
CREATE TABLE IF NOT EXISTS "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordReset_userId_idx" ON "PasswordReset"("userId");
CREATE INDEX IF NOT EXISTS "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PasswordReset_userId_fkey'
  ) THEN
    ALTER TABLE "PasswordReset"
      ADD CONSTRAINT "PasswordReset_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- School field on users and student invites
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "school" TEXT;
ALTER TABLE "StudentInvite" ADD COLUMN IF NOT EXISTS "school" TEXT;

-- Paid class materials (tutes)
-- Enum value is added here; indexes that *reference* 'material' must run in a later migration
-- (Postgres requires the new enum value to be committed before use).
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'material';

ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "price" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "published" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "materialId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payment_materialId_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_materialId_fkey"
      FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Payment_materialId_idx" ON "Payment"("materialId");
CREATE INDEX IF NOT EXISTS "Payment_paymentType_idx" ON "Payment"("paymentType");

-- Monthly/enrollment uniqueness must not block multiple material purchases in the same month.
DROP INDEX IF EXISTS "Payment_one_active_attempt_per_period_type_key";
CREATE UNIQUE INDEX "Payment_one_active_attempt_per_period_type_key"
ON "Payment" ("enrollmentId", "forMonth", "paymentType")
WHERE "status" IN ('pending', 'approved') AND "paymentType" IN ('enrollment', 'monthly');
