-- AlterEnum
ALTER TYPE "FileKind" ADD VALUE 'shipping_label';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "shippingLabelPhotoFileId" TEXT;
ALTER TABLE "User" ADD COLUMN "shippingLabelPhotoOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_shippingLabelPhotoFileId_key" ON "User"("shippingLabelPhotoFileId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_shippingLabelPhotoFileId_fkey"
  FOREIGN KEY ("shippingLabelPhotoFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
