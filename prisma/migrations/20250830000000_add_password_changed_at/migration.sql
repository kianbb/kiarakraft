-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);