-- V3-S1: Make SellerProfile.handle required and updatedAt non-null
-- Backfill any NULL handles with generated temp values before constraint change.
-- Assumes Postgres.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM "SellerProfile" WHERE handle IS NULL LOOP
    UPDATE "SellerProfile" SET handle = 'temp-' || substr(replace(cast(gen_random_uuid() as text),'-',''),1,16) WHERE id = r.id;
  END LOOP;
END $$;

-- Ensure no NULL updatedAt (if any legacy nulls)
UPDATE "SellerProfile" SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;

ALTER TABLE "SellerProfile" ALTER COLUMN handle SET NOT NULL;
ALTER TABLE "SellerProfile" ALTER COLUMN "updatedAt" SET NOT NULL;
