import assert from 'node:assert/strict';
import { prisma } from '@/lib/prisma';
import { searchProducts } from '@/lib/search';

async function seedProduct() {
  const seller = await prisma.sellerProfile.create({
    data: {
      user: {
        create: { email: `test_${Date.now()}@example.com`, password: 'x' },
      },
      handle: `test-search-${Date.now()}`,
      shopName: 'Test Search Shop',
      displayName: 'Test Search Seller',
      verified: true,
    },
    include: { user: true },
  });

  const category = await prisma.category.upsert({
    where: { slug: 'ceramics' },
    update: {},
    create: { slug: 'ceramics', name: 'Ceramics' },
  });

  const product = await prisma.product.create({
    data: {
      sellerId: seller.id,
      categoryId: category.id,
      title: 'Handmade Ceramic Bowl',
      slug: `search-ceramic-bowl-${Date.now()}`,
      description: 'A lovely handmade bowl',
      priceToman: 100000,
      stock: 5,
      active: true,
      eligibilityStatus: 'APPROVED',
      translations: {
        create: {
          locale: 'en',
          title: 'Handmade Ceramic Bowl',
          description: 'A lovely handmade bowl',
        },
      },
    },
  });
  return product;
}

async function run() {
  try {
    // Default locale partial
    const p1 = await seedProduct();
    const r1 = await searchProducts({
      query: 'Ceram',
      limit: 10,
      locale: 'fa',
    });
    const s1 = r1.products.map(x => x.slug);
    assert.ok(
      s1.includes(p1.slug),
      'Expected partial fa match to include product'
    );

    // English translation partial
    const p2 = await seedProduct();
    const r2 = await searchProducts({
      query: 'Ceram',
      limit: 10,
      locale: 'en',
    });
    const s2 = r2.products.map(x => x.slug);
    assert.ok(
      s2.includes(p2.slug),
      'Expected partial en match to include product'
    );

    // Middle substring
    const p3 = await seedProduct();
    const r3 = await searchProducts({ query: 'rami', limit: 10, locale: 'en' });
    const s3 = r3.products.map(x => x.slug);
    assert.ok(
      s3.includes(p3.slug),
      'Expected middle-substring match to include product'
    );

    console.log('🎉 Search partial match tests passed');
  } catch (err) {
    console.error('❌ Search partial match tests failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
