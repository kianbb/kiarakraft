#!/usr/bin/env npx tsx
/**
 * Diagnostic script to check seller products and debug why they might not be loading
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnoseSellerProducts(sellerEmail?: string) {
  console.log('🔍 Diagnosing Seller Products\n');
  console.log('==============================\n');

  try {
    // If email provided, check specific seller
    if (sellerEmail) {
      console.log(`📧 Checking seller: ${sellerEmail}\n`);

      const user = await prisma.user.findUnique({
        where: { email: sellerEmail },
        include: { sellerProfile: true },
      });

      if (!user) {
        console.log('❌ User not found with email:', sellerEmail);
        return;
      }

      if (!user.sellerProfile) {
        console.log('❌ User exists but has no seller profile');
        console.log('   User ID:', user.id);
        console.log('   Role:', user.role);
        return;
      }

      console.log('✅ Seller Profile Found:');
      console.log('   Profile ID:', user.sellerProfile.id);
      console.log('   Verified:', user.sellerProfile.verified);
      // @ts-expect-error - businessName might not be in type definition but exists in DB
      console.log(
        '   Business Name:',
        user.sellerProfile.businessName || 'N/A'
      );
      console.log('');

      // Get products for this seller
      const products = await prisma.product.findMany({
        where: { sellerId: user.sellerProfile.id },
        select: {
          id: true,
          title: true,
          active: true,
          eligibilityStatus: true,
          createdAt: true,
          priceToman: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      console.log(`📦 Products found: ${products.length}\n`);

      if (products.length === 0) {
        console.log('⚠️  No products found for this seller');

        // Check if there are ANY products with this seller ID
        const allProducts = await prisma.product.count();
        console.log(`\n📊 Total products in database: ${allProducts}`);

        // Check products by user ID instead (in case of mismatch)
        const productsByUserId = await prisma.product.count({
          where: {
            seller: {
              userId: user.id,
            },
          },
        });
        console.log(`📊 Products linked to user ID: ${productsByUserId}`);
      } else {
        products.forEach((p, i) => {
          console.log(`\n${i + 1}. ${p.title}`);
          console.log(`   ID: ${p.id}`);
          console.log(`   Active: ${p.active}`);
          console.log(`   Status: ${p.eligibilityStatus}`);
          console.log(`   Price: ${p.priceToman} Toman`);
          console.log(`   Created: ${p.createdAt.toISOString()}`);
        });
      }

      // Check rate limit entries for this user
      console.log('\n📈 Rate Limit Status:\n');
      const rateLimits = await prisma.rateLimit.findMany({
        where: {
          OR: [
            { identifier: { contains: `user:${user.id}` } },
            { identifier: { contains: user.sellerProfile.id } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      });

      if (rateLimits.length > 0) {
        console.log('Recent rate limit entries:');
        rateLimits.forEach(rl => {
          const remaining = new Date(rl.resetTime).getTime() - Date.now();
          console.log(`   ${rl.identifier}`);
          console.log(
            `   Count: ${rl.count}, Resets in: ${Math.max(0, Math.round(remaining / 1000))}s`
          );
        });
      } else {
        console.log('✅ No rate limit entries found (user not rate limited)');
      }
    } else {
      // General diagnostic - show all sellers and their product counts
      console.log('📊 All Sellers Overview:\n');

      const sellers = await prisma.sellerProfile.findMany({
        include: {
          user: true,
          _count: {
            select: { products: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      console.log(`Found ${sellers.length} seller profiles:\n`);

      sellers.forEach((seller, i) => {
        // @ts-expect-error - businessName might not be in type definition but exists in DB
        console.log(`${i + 1}. ${seller.businessName || 'Unnamed'}`);
        console.log(`   Email: ${seller.user.email}`);
        console.log(`   Seller ID: ${seller.id}`);
        console.log(`   Verified: ${seller.verified}`);
        console.log(`   Products: ${seller._count.products}`);
        console.log('');
      });

      // Show sample SQL query
      console.log('\n📝 Sample SQL Query to run in Neon:\n');
      console.log('```sql');
      console.log(
        'SELECT id, title, "sellerId" as seller_id, active, "eligibilityStatus", "createdAt"'
      );
      console.log('FROM "Product"');
      console.log('WHERE "sellerId" = \'<seller-profile-id>\'');
      console.log('ORDER BY "createdAt" DESC');
      console.log('LIMIT 5;');
      console.log('```');
    }
  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get email from command line argument
const sellerEmail = process.argv[2];

if (sellerEmail === '--help' || sellerEmail === '-h') {
  console.log(
    'Usage: npx tsx scripts/diagnose-seller-products.ts [seller-email]'
  );
  console.log('');
  console.log('Examples:');
  console.log(
    '  npx tsx scripts/diagnose-seller-products.ts                    # Show all sellers'
  );
  console.log(
    '  npx tsx scripts/diagnose-seller-products.ts seller@example.com # Check specific seller'
  );
  process.exit(0);
}

diagnoseSellerProducts(sellerEmail)
  .then(() => {
    console.log('\n✅ Diagnosis complete');
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
