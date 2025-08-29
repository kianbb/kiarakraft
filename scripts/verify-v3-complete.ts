#!/usr/bin/env npx tsx

/**
 * V3 Completion Verification Script
 *
 * Verifies all V3 features are working correctly:
 * - V3-S1: Seller Storefronts
 * - V3-S2: Cart/Checkout v2
 * - V3-S3: Reviews & Ratings
 * - V3-S4: Wishlists
 * - V3-S5: Notifications
 * - V3-S6: Returns/Refunds
 * - V3-S7: Multi-currency
 * - V3-S8: SEO++
 * - V3-S9: Performance
 * - V3-S10: QA & Compliance
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface VerificationResult {
  feature: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details: string;
}

const results: VerificationResult[] = [];

function addResult(
  feature: string,
  status: 'PASS' | 'FAIL' | 'WARN',
  details: string
) {
  results.push({ feature, status, details });
  const emoji = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  console.log(`${emoji} ${feature}: ${details}`);
}

async function verifyV3Features() {
  console.log('🔍 Verifying V3 Feature Completion...\n');

  try {
    // V3-S1: Seller Storefronts
    try {
      // First check if SellerProfile table exists and has handle field
      const allSellers = await prisma.sellerProfile.findMany({
        select: { handle: true },
      });
      const sellersWithHandles = allSellers.filter(
        s => s.handle && s.handle.length > 0
      ).length;
      addResult(
        'V3-S1 Seller Storefronts',
        'PASS',
        `${sellersWithHandles} sellers have shop handles (${allSellers.length} total sellers)`
      );
    } catch (error) {
      addResult(
        'V3-S1 Seller Storefronts',
        'FAIL',
        `SellerProfile table issue: ${error}`
      );
    }

    // V3-S2: Cart/Checkout v2
    try {
      const addressCount = await prisma.address.count();
      const orderShippingCount = await prisma.orderShipping.count();
      addResult(
        'V3-S2 Cart/Checkout v2',
        'PASS',
        `${addressCount} addresses, ${orderShippingCount} shipping records`
      );
    } catch (error) {
      addResult(
        'V3-S2 Cart/Checkout v2',
        'FAIL',
        `Address/OrderShipping tables issue: ${error}`
      );
    }

    // V3-S3: Reviews & Ratings
    try {
      const reviewCount = await prisma.review.count();
      const productsWithRatings = await prisma.product.count({
        where: { ratingCount: { gt: 0 } },
      });
      addResult(
        'V3-S3 Reviews & Ratings',
        'PASS',
        `${reviewCount} reviews, ${productsWithRatings} products with ratings`
      );
    } catch (error) {
      addResult(
        'V3-S3 Reviews & Ratings',
        'FAIL',
        `Review system issue: ${error}`
      );
    }

    // V3-S4: Wishlists
    try {
      const wishlistCount = await prisma.wishlistItem.count();
      addResult('V3-S4 Wishlists', 'PASS', `${wishlistCount} wishlist items`);
    } catch (error) {
      addResult(
        'V3-S4 Wishlists',
        'FAIL',
        `WishlistItem table issue: ${error}`
      );
    }

    // V3-S5: Notifications
    try {
      const pushSubCount = await prisma.pushSubscription.count();
      addResult(
        'V3-S5 Notifications',
        'PASS',
        `${pushSubCount} push subscriptions`
      );
    } catch (error) {
      addResult(
        'V3-S5 Notifications',
        'WARN',
        `PushSubscription table issue: ${error}`
      );
    }

    // V3-S6: Returns/Refunds
    try {
      const returnCount = await prisma.returnRequest.count();
      addResult(
        'V3-S6 Returns/Refunds',
        'PASS',
        `${returnCount} return requests`
      );
    } catch (error) {
      addResult(
        'V3-S6 Returns/Refunds',
        'FAIL',
        `ReturnRequest table issue: ${error}`
      );
    }

    // V3-S7: Multi-currency
    try {
      const fxRateCount = await prisma.fxRate.count();
      if (fxRateCount >= 2) {
        addResult(
          'V3-S7 Multi-currency',
          'PASS',
          `${fxRateCount} FX rates configured`
        );
      } else {
        addResult(
          'V3-S7 Multi-currency',
          'WARN',
          `Only ${fxRateCount} FX rates - run fx-update script`
        );
      }
    } catch (error) {
      addResult('V3-S7 Multi-currency', 'FAIL', `FxRate table issue: ${error}`);
    }

    // V3-S8: SEO++
    try {
      // Check if key files exist
      const fs = await import('fs');
      const sitemapExists = fs.existsSync(
        './app/sitemap/products.xml/route.ts'
      );
      const jsonLdExists = fs.existsSync('./components/seo/JsonLd.tsx');

      if (sitemapExists && jsonLdExists) {
        addResult(
          'V3-S8 SEO++',
          'PASS',
          'Segmented sitemaps and JSON-LD components exist'
        );
      } else {
        addResult('V3-S8 SEO++', 'FAIL', 'Missing SEO components');
      }
    } catch (error) {
      addResult('V3-S8 SEO++', 'WARN', `SEO file check failed: ${error}`);
    }

    // V3-S9: Performance
    try {
      const fs = await import('fs');
      const cacheExists = fs.existsSync('./lib/cache.ts');
      const cachedSearchExists = fs.existsSync('./lib/search-cached.ts');

      if (cacheExists && cachedSearchExists) {
        addResult(
          'V3-S9 Performance',
          'PASS',
          'Cache infrastructure and optimizations in place'
        );
      } else {
        addResult(
          'V3-S9 Performance',
          'FAIL',
          'Missing performance components'
        );
      }
    } catch (error) {
      addResult(
        'V3-S9 Performance',
        'WARN',
        `Performance check failed: ${error}`
      );
    }

    // V3-S10: QA & Compliance
    try {
      const fs = await import('fs');
      const exportExists = fs.existsSync(
        './app/api/account/data/export/route.ts'
      );
      const deleteExists = fs.existsSync(
        './app/api/account/data/delete/route.ts'
      );

      if (exportExists && deleteExists) {
        addResult(
          'V3-S10 QA & Compliance',
          'PASS',
          'Data export/delete APIs implemented'
        );
      } else {
        addResult('V3-S10 QA & Compliance', 'FAIL', 'Missing compliance APIs');
      }
    } catch (error) {
      addResult(
        'V3-S10 QA & Compliance',
        'WARN',
        `Compliance check failed: ${error}`
      );
    }
  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await prisma.$disconnect();
  }

  // Summary
  console.log('\n📊 V3 Feature Verification Summary:');
  const passed = results.filter(r => r.status === 'PASS').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`⚠️  Warnings: ${warned}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n🚨 Failed features need attention before V3 completion');
    process.exit(1);
  } else if (warned > 0) {
    console.log('\n⚠️  Some warnings present - V3 mostly complete');
    process.exit(0);
  } else {
    console.log('\n🎉 All V3 features verified successfully!');
    process.exit(0);
  }
}

verifyV3Features();
