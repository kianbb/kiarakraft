-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN "bannerUrl" TEXT,
ADD COLUMN "handle" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SellerProfile" ALTER COLUMN "bio" SET DATA TYPE TEXT;

-- CreateIndex
CREATE INDEX "SellerProfile_handle_idx" ON "SellerProfile"("handle");

-- Generate unique handles for existing records
-- This uses a window function to create unique handles with counters
WITH handle_generation AS (
  SELECT 
    id,
    CASE 
      WHEN ROW_NUMBER() OVER (PARTITION BY base_handle ORDER BY "createdAt") = 1 
      THEN base_handle
      ELSE base_handle || '-' || ROW_NUMBER() OVER (PARTITION BY base_handle ORDER BY "createdAt")
    END as unique_handle
  FROM (
    SELECT 
      id,
      "createdAt",
      LOWER(
        TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE("shopName", '[^a-zA-Z0-9\s]', '', 'g'),
            '\s+', '-', 'g'
          ),
          '-'
        )
      ) as base_handle
    FROM "SellerProfile"
  ) t
)
UPDATE "SellerProfile" 
SET "handle" = handle_generation.unique_handle,
    "updatedAt" = NOW()
FROM handle_generation
WHERE "SellerProfile".id = handle_generation.id;

-- Add unique constraint after populating data
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_handle_key" UNIQUE ("handle");