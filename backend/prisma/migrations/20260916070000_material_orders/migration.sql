-- CreateEnum
CREATE TYPE "MaterialOrderStatus" AS ENUM (
  'approval_pending',
  'active',
  'processing',
  'delivered',
  'cancelled',
  'rejected'
);

-- CreateTable
CREATE TABLE "MaterialOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "shippingLabelNo" TEXT,
    "status" "MaterialOrderStatus" NOT NULL DEFAULT 'approval_pending',
    "recipientName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "grade" TEXT NOT NULL DEFAULT '',
    "remarks" TEXT,
    "slipFileId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelNote" TEXT,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "materialTitle" TEXT NOT NULL,
    "classTitle" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "MaterialOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialOrder_tenantId_orderNo_key" ON "MaterialOrder"("tenantId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialOrder_tenantId_shippingLabelNo_key" ON "MaterialOrder"("tenantId", "shippingLabelNo");

-- CreateIndex
CREATE INDEX "MaterialOrder_tenantId_status_idx" ON "MaterialOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MaterialOrder_tenantId_createdAt_idx" ON "MaterialOrder"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MaterialOrder_studentId_idx" ON "MaterialOrder"("studentId");

-- CreateIndex
CREATE INDEX "MaterialOrder_slipFileId_idx" ON "MaterialOrder"("slipFileId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialOrderItem_paymentId_key" ON "MaterialOrderItem"("paymentId");

-- CreateIndex
CREATE INDEX "MaterialOrderItem_orderId_idx" ON "MaterialOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "MaterialOrderItem_classId_idx" ON "MaterialOrderItem"("classId");

-- CreateIndex
CREATE INDEX "MaterialOrderItem_materialId_idx" ON "MaterialOrderItem"("materialId");

-- AddForeignKey
ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_slipFileId_fkey" FOREIGN KEY ("slipFileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaterialOrderItem" ADD CONSTRAINT "MaterialOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MaterialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaterialOrderItem" ADD CONSTRAINT "MaterialOrderItem_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaterialOrderItem" ADD CONSTRAINT "MaterialOrderItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaterialOrderItem" ADD CONSTRAINT "MaterialOrderItem_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
