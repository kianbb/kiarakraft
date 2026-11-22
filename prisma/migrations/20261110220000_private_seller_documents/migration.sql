-- Preserve all existing rows/references as unclassified legacy documents.
ALTER TABLE "SellerDocument"
  ADD COLUMN "resourceType" TEXT,
  ADD COLUMN "deliveryType" TEXT,
  ADD COLUMN "status" TEXT;
