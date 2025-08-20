#!/usr/bin/env tsx
/**
 * Verify audit test data exists
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verifying audit test data...\n');

  const testUser = await prisma.user.findUnique({
    where: { email: 'audit-test@kiarakraft.com' },
    include: {
      sellerProfile: true,
    }
  });

  if (!testUser) {
    console.log('❌ Test user not found');
    return;
  }

  console.log('✅ Test user found:');
  console.log(`   ID: ${testUser.id}`);
  console.log(`   Email: ${testUser.email}`);
  console.log(`   Name: ${testUser.name}`);
  console.log(`   Has seller profile: ${!!testUser.sellerProfile}`);
  
  if (testUser.sellerProfile) {
    console.log(`   Seller verified: ${testUser.sellerProfile.verified}`);
    console.log(`   Shop name: ${testUser.sellerProfile.shopName}`);
  }

  const testProduct = await prisma.product.findUnique({
    where: { slug: 'audit-test-product' },
    include: {
      images: true,
      seller: true,
      category: true,
    }
  });

  if (!testProduct) {
    console.log('❌ Test product not found');
    return;
  }

  console.log('\n✅ Test product found:');
  console.log(`   ID: ${testProduct.id}`);
  console.log(`   Title: ${testProduct.title}`);
  console.log(`   Stock: ${testProduct.stock}`);
  console.log(`   Active: ${testProduct.active}`);
  console.log(`   Eligibility: ${testProduct.eligibilityStatus}`);
  console.log(`   Price: ${testProduct.priceToman} TMN`);
  console.log(`   Images: ${testProduct.images.length}`);
  console.log(`   Seller: ${testProduct.seller?.displayName}`);
  console.log(`   Category: ${testProduct.category?.name}`);

  console.log('\n🎉 All audit test data verified!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });