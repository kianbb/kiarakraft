#!/usr/bin/env tsx
/**
 * Setup test data for V2 production audit
 */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Setting up audit test data...\n');

  // Create test user
  const testEmail = 'audit-test@kiarakraft.com';
  let testUser;

  try {
    testUser = await prisma.user.upsert({
      where: { email: testEmail },
      update: {},
      create: {
        email: testEmail,
        name: 'Audit Test User',
        password: await hash('AuditTest123!', 12),
      },
    });
    console.log('✅ Test user created/found:', testUser.id);
  } catch (error) {
    console.error('❌ Failed to create test user:', error);
    throw error;
  }

  // Create test seller profile
  let testSeller;
  try {
    testSeller = await prisma.sellerProfile.upsert({
      where: { userId: testUser.id },
      update: {},
      create: {
        userId: testUser.id,
        displayName: 'Audit Test Shop',
        shopName: 'audit-test-shop',
        handle: 'audit-test-shop',
        bio: 'Test shop for production audit',
        verified: true,
        verifiedAt: new Date(),
      },
    });
    console.log('✅ Test seller created/found:', testSeller.id);
  } catch (error) {
    console.error('❌ Failed to create test seller:', error);
    throw error;
  }

  // Create test category
  let testCategory;
  try {
    testCategory = await prisma.category.upsert({
      where: { slug: 'audit-test' },
      update: {},
      create: {
        name: 'Audit Test Category',
        slug: 'audit-test',
      },
    });
    console.log('✅ Test category created/found:', testCategory.id);
  } catch (error) {
    console.error('❌ Failed to create test category:', error);
    throw error;
  }

  // Create test product with stock
  let testProduct;
  try {
    testProduct = await prisma.product.upsert({
      where: { slug: 'audit-test-product' },
      update: {
        stock: 10, // Ensure we have stock
        active: true,
        eligibilityStatus: 'APPROVED',
      },
      create: {
        title: 'Audit Test Product',
        slug: 'audit-test-product',
        description: 'A test product for production audit',
        priceToman: 500000,
        stock: 10,
        active: true,
        eligibilityStatus: 'APPROVED',
        sellerId: testSeller.id,
        categoryId: testCategory.id,
      },
    });
    console.log(
      '✅ Test product created/found:',
      testProduct.id,
      'with stock:',
      testProduct.stock
    );
  } catch (error) {
    console.error('❌ Failed to create test product:', error);
    throw error;
  }

  // Add a test image for the product
  try {
    const existingImage = await prisma.listingImage.findFirst({
      where: {
        productId: testProduct.id,
        sortOrder: 0,
      },
    });

    if (!existingImage) {
      const testImage = await prisma.listingImage.create({
        data: {
          productId: testProduct.id,
          url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop',
          alt: 'Audit test product image',
          sortOrder: 0,
        },
      });
      console.log('✅ Test product image created:', testImage.id);
    } else {
      console.log('✅ Test product image found:', existingImage.id);
    }
  } catch (error) {
    console.error('❌ Failed to create test image:', error);
    throw error;
  }

  console.log('\n🎉 Audit test data setup complete!');
  console.log('📊 Summary:');
  console.log(`   User: ${testUser.email} (ID: ${testUser.id})`);
  console.log(`   Seller: ${testSeller.shopName} (ID: ${testSeller.id})`);
  console.log(
    `   Product: ${testProduct.title} (ID: ${testProduct.id}, Stock: ${testProduct.stock})`
  );
  console.log(`   Category: ${testCategory.name} (ID: ${testCategory.id})`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
