-- V3-S3: Reviews & Ratings with moderation and aggregates

-- Add rating aggregates to Product table
ALTER TABLE "Product" ADD COLUMN "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- Extend Review table for moderation workflow
ALTER TABLE "Review" ADD COLUMN "title" TEXT;
ALTER TABLE "Review" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Review" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Rename comment to body and change to TEXT type
ALTER TABLE "Review" RENAME COLUMN "comment" TO "body";
ALTER TABLE "Review" ALTER COLUMN "body" TYPE TEXT;

-- Change rating to SmallInt for efficiency
ALTER TABLE "Review" ALTER COLUMN "rating" TYPE SMALLINT;

-- Drop existing unique index and recreate with correct column order  
DROP INDEX "Review_userId_productId_key";
CREATE UNIQUE INDEX "Review_productId_userId_key" ON "Review"("productId", "userId");

-- Add index for efficient review queries by product and status
CREATE INDEX "Review_productId_status_idx" ON "Review"("productId", "status");

-- Backfill existing reviews with default status and updatedAt
UPDATE "Review" SET "status" = 'APPROVED', "updatedAt" = "createdAt" WHERE "status" IS NULL;

-- Calculate and update existing rating aggregates for products with reviews
UPDATE "Product" SET 
  "ratingAvg" = subquery.avg_rating,
  "ratingCount" = subquery.review_count
FROM (
  SELECT 
    "productId",
    AVG("rating"::numeric) as avg_rating,
    COUNT(*) as review_count
  FROM "Review"
  WHERE "status" = 'APPROVED'
  GROUP BY "productId"
) AS subquery
WHERE "Product"."id" = subquery."productId";