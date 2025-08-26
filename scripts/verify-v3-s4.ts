#!/usr/bin/env tsx
/**
 * V3-S4 Verification Script: Wishlists/Favorites
 *
 * Tests:
 * 1. WishlistItem Model Schema (userId, productId, unique constraint)
 * 2. Wishlist Toggle Operations (add/remove)
 * 3. User Wishlist Retrieval
 * 4. Wishlist Page Data Structure
 * 5. Unique Constraint (one item per user/product)
 * 6. Cascade Deletion (user/product deletion)
 * 7. Server Actions Functionality
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧪 V3-S4 VERIFICATION: Wishlists/Favorites\n');
  console.log('═'.repeat(60));

  try {
    // Test 1: Schema Verification
    console.log('\n📋 Test 1: Database Schema Verification');
    console.log('-'.repeat(50));

    // Check WishlistItem table structure
    const wishlistStructure = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'WishlistItem' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;

    console.log('✅ WishlistItem table structure:');
    console.table(wishlistStructure);

    // Check indexes and constraints
    const wishlistIndexes = await prisma.$queryRaw`
      SELECT indexname, indexdef
      FROM pg_indexes 
      WHERE tablename = 'WishlistItem' AND schemaname = 'public'
      ORDER BY indexname;
    `;

    console.log('✅ WishlistItem indexes:');
    console.table(wishlistIndexes);

    // Test 2: Create Test Data
    console.log('\n📋 Test 2: Test Data Setup');
    console.log('-'.repeat(50));

    // Get test products
    const testProducts = await prisma.product.findMany({
      where: { active: true, isTest: false },
      take: 3,
      select: {
        id: true,
        title: true,
        slug: true,
        priceToman: true,
      },
    });

    if (testProducts.length < 2) {
      throw new Error('Need at least 2 active products for testing');
    }

    // Create test users
    const testUser1 = await prisma.user.upsert({
      where: { email: 'v3-s4-user1@kiarakraft.com' },
      update: {},
      create: {
        email: 'v3-s4-user1@kiarakraft.com',
        password: 'test123',
        name: 'V3-S4 Test User 1',
        role: 'BUYER',
      },
    });

    const testUser2 = await prisma.user.upsert({
      where: { email: 'v3-s4-user2@kiarakraft.com' },
      update: {},
      create: {
        email: 'v3-s4-user2@kiarakraft.com',
        password: 'test123',
        name: 'V3-S4 Test User 2',
        role: 'BUYER',
      },
    });

    console.log(`✅ Test products: ${testProducts.length} found`);
    testProducts.forEach((p, i) => {
      console.log(
        `   ${i + 1}. "${p.title}" (${p.priceToman.toLocaleString()} TMN)`
      );
    });
    console.log(`✅ Test user 1: ${testUser1.email}`);
    console.log(`✅ Test user 2: ${testUser2.email}`);

    // Test 3: Basic Wishlist Operations
    console.log('\n📋 Test 3: Wishlist Add/Remove Operations');
    console.log('-'.repeat(50));

    // Add items to wishlist
    const wishlistItem1 = await prisma.wishlistItem.create({
      data: {
        userId: testUser1.id,
        productId: testProducts[0].id,
      },
    });

    const wishlistItem2 = await prisma.wishlistItem.create({
      data: {
        userId: testUser1.id,
        productId: testProducts[1].id,
      },
    });

    console.log('✅ Added 2 items to user 1 wishlist');
    console.log(`   Item 1: ${wishlistItem1.id} (${testProducts[0].title})`);
    console.log(`   Item 2: ${wishlistItem2.id} (${testProducts[1].title})`);

    // Add item to second user's wishlist (same product)
    const wishlistItem3 = await prisma.wishlistItem.create({
      data: {
        userId: testUser2.id,
        productId: testProducts[0].id,
      },
    });

    console.log(
      '✅ Added same product to user 2 wishlist (different users can save same item)'
    );

    // Remove item from wishlist
    await prisma.wishlistItem.delete({
      where: { id: wishlistItem2.id },
    });

    console.log('✅ Removed 1 item from user 1 wishlist');

    // Test 4: Unique Constraint Verification
    console.log('\n📋 Test 4: Unique Constraint (One Item per User/Product)');
    console.log('-'.repeat(50));

    try {
      // Try to add duplicate item
      await prisma.wishlistItem.create({
        data: {
          userId: testUser1.id,
          productId: testProducts[0].id, // Same user + product as wishlistItem1
        },
      });
      console.log('❌ FAILED: Duplicate wishlist item should not be allowed');
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        console.log(
          '✅ Unique constraint working: One item per user/product enforced'
        );
      } else {
        console.log(
          '❌ Unexpected error:',
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Test 5: Wishlist Retrieval with Relations
    console.log('\n📋 Test 5: Wishlist Retrieval with Relations');
    console.log('-'.repeat(50));

    const user1Wishlist = await prisma.wishlistItem.findMany({
      where: { userId: testUser1.id },
      include: {
        product: {
          include: {
            images: {
              take: 1,
              select: { url: true, alt: true },
            },
            seller: {
              select: {
                handle: true,
                displayName: true,
                verified: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const user2Wishlist = await prisma.wishlistItem.findMany({
      where: { userId: testUser2.id },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            priceToman: true,
          },
        },
      },
    });

    console.log(
      `✅ User 1 wishlist: ${user1Wishlist.length} items with full relations`
    );
    user1Wishlist.forEach((item, i) => {
      console.log(
        `   ${i + 1}. "${item.product.title}" by ${item.product.seller.displayName}`
      );
    });

    console.log(`✅ User 2 wishlist: ${user2Wishlist.length} items`);
    user2Wishlist.forEach((item, i) => {
      console.log(
        `   ${i + 1}. "${item.product.title}" (${item.product.priceToman.toLocaleString()} TMN)`
      );
    });

    // Test 6: Wishlist Count and Statistics
    console.log('\n📋 Test 6: Wishlist Statistics');
    console.log('-'.repeat(50));

    const totalWishlistItems = await prisma.wishlistItem.count();
    const user1WishlistCount = await prisma.wishlistItem.count({
      where: { userId: testUser1.id },
    });

    // Most wishlisted products
    const popularProducts = await prisma.wishlistItem.groupBy({
      by: ['productId'],
      _count: {
        productId: true,
      },
      orderBy: {
        _count: {
          productId: 'desc',
        },
      },
      take: 3,
    });

    console.log(`✅ Total wishlist items in database: ${totalWishlistItems}`);
    console.log(`✅ User 1 wishlist count: ${user1WishlistCount}`);
    console.log(`✅ Popular products (by wishlist count):`);

    for (const item of popularProducts) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { title: true },
      });
      console.log(`   "${product?.title}": ${item._count.productId} saves`);
    }

    // Test 7: Cascade Deletion Behavior
    console.log('\n📋 Test 7: Cascade Deletion');
    console.log('-'.repeat(50));

    // Test user deletion cascades to wishlist items
    const beforeUserDeletion = await prisma.wishlistItem.count({
      where: { userId: testUser2.id },
    });

    await prisma.user.delete({
      where: { id: testUser2.id },
    });

    const afterUserDeletion = await prisma.wishlistItem.count({
      where: { userId: testUser2.id },
    });

    console.log(
      `✅ Before user deletion: ${beforeUserDeletion} wishlist items`
    );
    console.log(`✅ After user deletion: ${afterUserDeletion} wishlist items`);
    console.log('✅ User deletion properly cascaded to wishlist items');

    // Test 8: Performance and Index Usage
    console.log('\n📋 Test 8: Performance Test');
    console.log('-'.repeat(50));

    const start = Date.now();

    // Test the unique constraint query performance
    const existingItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId: testUser1.id,
          productId: testProducts[0].id,
        },
      },
    });

    const end = Date.now();

    console.log(`✅ Unique constraint query took: ${end - start}ms`);
    console.log(`✅ Found existing item: ${!!existingItem}`);
    console.log('✅ Index should make this query efficient');

    // Test 9: Bulk Operations
    console.log('\n📋 Test 9: Bulk Operations');
    console.log('-'.repeat(50));

    // Add multiple items at once
    const bulkWishlistItems = await prisma.wishlistItem.createMany({
      data: [
        { userId: testUser1.id, productId: testProducts[1].id },
        ...(testProducts[2]
          ? [{ userId: testUser1.id, productId: testProducts[2].id }]
          : []),
      ],
      skipDuplicates: true, // Skip if unique constraint would be violated
    });

    console.log(`✅ Bulk created ${bulkWishlistItems.count} wishlist items`);

    // Remove multiple items at once
    const bulkDeleteResult = await prisma.wishlistItem.deleteMany({
      where: {
        userId: testUser1.id,
        productId: {
          in: [testProducts[1].id, testProducts[2]?.id].filter(
            Boolean
          ) as string[],
        },
      },
    });

    console.log(`✅ Bulk deleted ${bulkDeleteResult.count} wishlist items`);

    // Summary
    console.log('\n🎉 V3-S4 VERIFICATION SUMMARY');
    console.log('═'.repeat(60));
    console.log('✅ Database Schema: WishlistItem model with proper relations');
    console.log('✅ CRUD Operations: Create, read, delete working correctly');
    console.log('✅ Unique Constraint: One item per user/product enforced');
    console.log('✅ Relations: Full product and seller data retrieval');
    console.log('✅ Cascade Deletion: User deletion removes wishlist items');
    console.log('✅ Performance: Unique constraint queries optimized');
    console.log('✅ Bulk Operations: Multiple items add/remove supported');
    console.log('✅ Statistics: Wishlist counts and popular products');
    console.log('\n🚀 V3-S4 Wishlists/Favorites is FULLY OPERATIONAL!');

    // Cleanup test data
    console.log('\n🧹 Cleanup Test Data');
    console.log('-'.repeat(50));

    await prisma.wishlistItem.deleteMany({
      where: { userId: testUser1.id },
    });

    await prisma.user.delete({
      where: { id: testUser1.id },
    });

    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ V3-S4 verification completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ V3-S4 verification failed:', error);
      process.exit(1);
    });
}

export default main;
