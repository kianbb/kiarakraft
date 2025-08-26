#!/usr/bin/env tsx
/**
 * Database Operations Test
 * Verify that new database schema changes work correctly
 */

import { prisma } from '../lib/prisma';

console.log('🗄️  Testing Database Operations...\n');

async function testRateLimitTable() {
  console.log('Testing RateLimit table operations...');
  let passed = 0;
  let total = 0;

  try {
    // Test 1: Create a rate limit entry
    total++;
    const testIdentifier = `test_${Date.now()}`;
    const rateLimit = await prisma.rateLimit.create({
      data: {
        identifier: testIdentifier,
        count: 1,
        resetTime: new Date(Date.now() + 60000), // 1 minute from now
      },
    });

    if (rateLimit && rateLimit.identifier === testIdentifier) {
      console.log('✅ RateLimit CREATE operation working');
      passed++;
    } else {
      console.log('❌ RateLimit CREATE operation failed');
    }

    // Test 2: Read the rate limit entry
    total++;
    const foundRateLimit = await prisma.rateLimit.findUnique({
      where: { identifier: testIdentifier },
    });

    if (foundRateLimit && foundRateLimit.count === 1) {
      console.log('✅ RateLimit READ operation working');
      passed++;
    } else {
      console.log('❌ RateLimit READ operation failed');
    }

    // Test 3: Update the rate limit entry
    total++;
    const updatedRateLimit = await prisma.rateLimit.update({
      where: { identifier: testIdentifier },
      data: { count: { increment: 1 } },
    });

    if (updatedRateLimit && updatedRateLimit.count === 2) {
      console.log('✅ RateLimit UPDATE operation working');
      passed++;
    } else {
      console.log('❌ RateLimit UPDATE operation failed');
    }

    // Test 4: Delete the rate limit entry
    total++;
    await prisma.rateLimit.delete({
      where: { identifier: testIdentifier },
    });

    const deletedRateLimit = await prisma.rateLimit.findUnique({
      where: { identifier: testIdentifier },
    });

    if (deletedRateLimit === null) {
      console.log('✅ RateLimit DELETE operation working');
      passed++;
    } else {
      console.log('❌ RateLimit DELETE operation failed');
    }

    // Test 5: Cleanup operations (deleteMany)
    total++;
    const now = new Date();
    await prisma.rateLimit.deleteMany({
      where: {
        resetTime: { lt: now },
      },
    });
    console.log('✅ RateLimit CLEANUP operation working');
    passed++;
  } catch (error) {
    console.error('❌ Database operation failed:', error);
  }

  return { passed, total };
}

async function testExistingTables() {
  console.log('\nTesting existing table operations...');
  let passed = 0;
  let total = 0;

  try {
    // Test existing User operations
    total++;
    const userCount = await prisma.user.count();
    if (typeof userCount === 'number') {
      console.log('✅ User table operations working');
      passed++;
    } else {
      console.log('❌ User table operations failed');
    }

    // Test existing Product operations
    total++;
    const productCount = await prisma.product.count();
    if (typeof productCount === 'number') {
      console.log('✅ Product table operations working');
      passed++;
    } else {
      console.log('❌ Product table operations failed');
    }

    // Test existing Category operations
    total++;
    const categoryCount = await prisma.category.count();
    if (typeof categoryCount === 'number') {
      console.log('✅ Category table operations working');
      passed++;
    } else {
      console.log('❌ Category table operations failed');
    }
  } catch (error) {
    console.error('❌ Existing table operations failed:', error);
  }

  return { passed, total };
}

async function runDatabaseTests() {
  console.log('🗄️  Database Operations Test Suite');
  console.log('===================================\n');

  const rateLimitResults = await testRateLimitTable();
  const existingTablesResults = await testExistingTables();

  const totalPassed = rateLimitResults.passed + existingTablesResults.passed;
  const totalTests = rateLimitResults.total + existingTablesResults.total;

  console.log('\n📊 Database Test Results:');
  console.log('=========================');
  console.log(
    `RateLimit Table: ${rateLimitResults.passed}/${rateLimitResults.total} tests passed`
  );
  console.log(
    `Existing Tables: ${existingTablesResults.passed}/${existingTablesResults.total} tests passed`
  );
  console.log('=========================');
  console.log(`Overall: ${totalPassed}/${totalTests} tests passed`);

  if (totalPassed === totalTests) {
    console.log('🎉 ALL DATABASE TESTS PASSED! 🎉');
    console.log('✅ Database operations are working correctly');
  } else {
    console.log('⚠️  Some database tests failed');
    console.log('❗ Please check the database configuration');
  }

  await prisma.$disconnect();
  return totalPassed === totalTests;
}

// Execute tests
runDatabaseTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Database test execution failed:', error);
    process.exit(1);
  });
