-- CreateTable
CREATE TABLE "AIUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIUsage_userId_idx" ON "AIUsage"("userId");

-- CreateIndex
CREATE INDEX "AIUsage_timestamp_idx" ON "AIUsage"("timestamp");

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;