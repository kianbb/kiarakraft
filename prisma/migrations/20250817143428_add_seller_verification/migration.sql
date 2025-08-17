-- AlterTable
ALTER TABLE "public"."SellerProfile" ADD COLUMN     "city" TEXT,
ADD COLUMN     "docsFolder" TEXT,
ADD COLUMN     "nationalIdHash" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "verificationNotes" TEXT,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;
