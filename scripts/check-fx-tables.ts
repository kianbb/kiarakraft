#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTables() {
  try {
    console.log('🔍 Checking database tables...');

    // Check if FxRate table exists
    try {
      const fxRates = await prisma.fxRate.findMany();
      console.log('✅ FxRate table exists with', fxRates.length, 'records');
      if (fxRates.length > 0) {
        console.log('   Sample rates:');
        fxRates.forEach(rate => {
          console.log(`   - ${rate.base}/${rate.counter}: ${rate.rate}`);
        });
      }
    } catch (error) {
      console.log('❌ FxRate table does not exist');
    }

    // Check if ReturnRequest table exists
    try {
      const returns = await prisma.returnRequest.findMany({ take: 1 });
      console.log('✅ ReturnRequest table exists');
    } catch (error) {
      console.log('❌ ReturnRequest table does not exist');
    }

    // Check if RateLimit table exists
    try {
      const limits = await prisma.rateLimit.findMany({ take: 1 });
      console.log('✅ RateLimit table exists');
    } catch (error) {
      console.log('❌ RateLimit table does not exist');
    }
  } catch (error) {
    console.error('Error checking tables:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTables();
