-- Safe to reference PaymentType.material after the prior migration committed the enum value.
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_one_active_material_purchase_key"
ON "Payment" ("materialId", "enrollmentId")
WHERE "status" IN ('pending', 'approved') AND "materialId" IS NOT NULL AND "paymentType" = 'material';
