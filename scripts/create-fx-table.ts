#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createFxTable() {
  try {
    console.log('🔨 Creating FxRate table manually...');

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "public"."FxRate" (
        "id" TEXT NOT NULL,
        "base" TEXT NOT NULL,
        "counter" TEXT NOT NULL,
        "rate" DOUBLE PRECISION NOT NULL,
        "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
      );
    `;

    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "FxRate_base_counter_key" 
      ON "public"."FxRate"("base", "counter");
    `;

    console.log('✅ FxRate table created successfully');

    // Verify the table exists
    const testQuery = await prisma.fxRate.findMany();
    console.log(
      '📊 FxRate table is accessible, found',
      testQuery.length,
      'records'
    );
  } catch (error) {
    console.error('❌ Error creating FxRate table:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createFxTable();
