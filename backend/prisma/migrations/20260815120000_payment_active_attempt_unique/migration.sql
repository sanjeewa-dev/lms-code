-- Prevent concurrent pending/approved payment attempts for the same
-- enrollment, billing month, and payment type. Rejected payments remain
-- so students can retry after a rejection.
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_one_active_attempt_per_period_type_key"
ON "Payment" ("enrollmentId", "forMonth", "paymentType")
WHERE "status" IN ('pending', 'approved');
