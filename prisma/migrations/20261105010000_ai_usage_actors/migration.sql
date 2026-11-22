-- Retain historical human attribution and allow bounded background services
-- without creating accounts that could authenticate.
ALTER TABLE "AIUsage" ADD COLUMN "actorId" TEXT;
UPDATE "AIUsage" SET "actorId" = "userId";
ALTER TABLE "AIUsage" ALTER COLUMN "actorId" SET NOT NULL;
ALTER TABLE "AIUsage" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_actor_identity_check"
CHECK (
    "actorId" <> '' AND (
        ("userId" IS NOT NULL AND "actorId" = "userId") OR
        ("userId" IS NULL AND "actorId" LIKE 'service:%')
    )
);

CREATE INDEX "AIUsage_actorId_timestamp_idx" ON "AIUsage"("actorId", "timestamp");
