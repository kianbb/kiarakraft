-- Add missing fields to SellerProfile table
ALTER TABLE "SellerProfile" ADD COLUMN "phone" TEXT;
ALTER TABLE "SellerProfile" ADD COLUMN "address" TEXT;
ALTER TABLE "SellerProfile" ADD COLUMN "website" TEXT;