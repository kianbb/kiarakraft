#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 V3-S1 Seller Storefronts Verification');
  console.log('=====================================');

  // 1. Check schema and data integrity
  console.log('\n1️⃣ Database Schema & Data');
  const sellers = await prisma.sellerProfile.findMany({
    select: {
      id: true,
      handle: true,
      shopName: true,
      displayName: true,
      verified: true,
      bannerUrl: true,
      products: {
        where: { active: true, isTest: false },
        take: 5,
      },
      _count: {
        select: {
          products: { where: { active: true, isTest: false } },
        },
      },
    },
    take: 5,
  });

  sellers.forEach((seller, i) => {
    console.log(
      `   ${i + 1}. Handle: "${seller.handle}" | Shop: "${seller.shopName}"`
    );
    console.log(
      `      Products: ${seller._count.products} | Verified: ${seller.verified}`
    );
    if (seller.bannerUrl)
      console.log(`      Banner: ${seller.bannerUrl.substring(0, 50)}...`);
  });

  // 2. Check handle uniqueness
  console.log('\n2️⃣ Handle Uniqueness');
  const allHandles = await prisma.sellerProfile.findMany({
    select: { handle: true },
    where: { handle: { not: null } },
  });

  const handleCounts = allHandles.reduce(
    (acc: Record<string, number>, { handle }) => {
      if (handle) acc[handle] = (acc[handle] || 0) + 1;
      return acc;
    },
    {}
  );

  const duplicates = Object.entries(handleCounts).filter(
    ([, count]) => count > 1
  );
  if (duplicates.length > 0) {
    console.log(`   ❌ DUPLICATES FOUND: ${duplicates}`);
  } else {
    console.log(
      `   ✅ All ${Object.keys(handleCounts).length} handles are unique`
    );
  }

  // 3. Sample shop URLs for manual testing
  console.log('\n3️⃣ Shop URLs for Testing');
  const sampleSellers = sellers.filter(s => s.handle).slice(0, 3);
  sampleSellers.forEach(seller => {
    console.log(`   🔗 /fa/shop/${seller.handle} (${seller.shopName})`);
  });

  // 4. API Test URLs
  console.log('\n4️⃣ API Endpoints for curl Testing');
  console.log('   GET /api/seller/profile (requires auth)');
  console.log('   PUT /api/seller/profile (requires auth + JSON body)');

  // 5. Expected Vercel Preview Testing Steps
  console.log('\n5️⃣ Manual Verification Steps');
  console.log('   1. Wait for Vercel preview deployment');
  console.log('   2. Test shop pages: [preview-url]/fa/shop/atelier-kiara');
  console.log('   3. Test settings page: [preview-url]/fa/seller/settings');
  console.log('   4. Test 404 handling: [preview-url]/fa/shop/nonexistent');
  console.log('   5. Check OpenGraph meta tags in page source');

  console.log('\n✅ Verification script completed');
  console.log('Next: Await Vercel preview + manual testing');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
