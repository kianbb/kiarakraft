-- Create SellerDocument table (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema='public' AND table_name='SellerDocument'
  ) THEN
    CREATE TABLE "SellerDocument" (
      "id" TEXT NOT NULL,
      "sellerId" TEXT NOT NULL,
      "publicId" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "mime" TEXT NOT NULL,
      "bytes" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SellerDocument_pkey" PRIMARY KEY ("id")
    );

    CREATE INDEX IF NOT EXISTS "SellerDocument_sellerId_idx" ON "SellerDocument" ("sellerId");

    ALTER TABLE "SellerDocument" ADD CONSTRAINT "SellerDocument_sellerId_fkey" 
      FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END;
$$;
