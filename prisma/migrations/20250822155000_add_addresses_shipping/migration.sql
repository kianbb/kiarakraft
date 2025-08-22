-- CreateEnum
CREATE TYPE "ShippingMethod" AS ENUM ('STANDARD', 'EXPRESS', 'PICKUP');

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "postal" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderShipping" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "ShippingMethod" NOT NULL,
    "priceToman" INTEGER NOT NULL,
    "trackingNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "history" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderShipping_pkey" PRIMARY KEY ("id")
);

-- Migrate existing order address data to Address table
INSERT INTO "Address" (
    "id", 
    "userId", 
    "fullName", 
    "phone", 
    "country", 
    "province", 
    "city", 
    "line1", 
    "line2", 
    "postal", 
    "isDefault", 
    "createdAt", 
    "updatedAt"
)
SELECT 
    'addr_' || "Order"."id" as "id",
    "Order"."userId",
    "Order"."fullName",
    "Order"."phone",
    'IR' as "country",
    "Order"."province",
    "Order"."city",
    "Order"."address1" as "line1",
    "Order"."address2" as "line2",
    "Order"."postalCode" as "postal",
    false as "isDefault",
    "Order"."createdAt",
    "Order"."updatedAt"
FROM "Order"
WHERE "Order"."fullName" IS NOT NULL;

-- Add addressId column to Order table
ALTER TABLE "Order" ADD COLUMN "addressId" TEXT;

-- Update orders to reference the migrated addresses
UPDATE "Order" SET "addressId" = 'addr_' || "Order"."id" WHERE "fullName" IS NOT NULL;

-- Make addressId required after data migration
ALTER TABLE "Order" ALTER COLUMN "addressId" SET NOT NULL;

-- Drop old address columns from Order table
ALTER TABLE "Order" DROP COLUMN "fullName";
ALTER TABLE "Order" DROP COLUMN "phone";
ALTER TABLE "Order" DROP COLUMN "address1";
ALTER TABLE "Order" DROP COLUMN "address2";
ALTER TABLE "Order" DROP COLUMN "city";
ALTER TABLE "Order" DROP COLUMN "province";
ALTER TABLE "Order" DROP COLUMN "postalCode";

-- CreateIndex
CREATE UNIQUE INDEX "OrderShipping_orderId_key" ON "OrderShipping"("orderId");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderShipping" ADD CONSTRAINT "OrderShipping_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;