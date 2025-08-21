import { prisma } from '../lib/prisma';

/**
 * Marks legacy seeded / demo / test products (by seller names or slug patterns)
 * with isTest=true so they are excluded everywhere by the unified visibility filter.
 *
 * Safe to run multiple times (idempotent). Does NOT delete data.
 */
async function markLegacyTestProducts() {
  const sellerNameMatches = [
    'Test Search Seller',
    'Search Test Seller',
    'Test Seller',
  ];

  // Identify candidate products
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { slug: { startsWith: 'test-' } },
        { slug: { startsWith: 'search-ceramic-bowl-' } },
        { seller: { displayName: { in: sellerNameMatches } } },
        { seller: { shopName: { in: ['Test Shop'] } } },
      ],
      isTest: false,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      seller: { select: { displayName: true, shopName: true } },
    },
  });

  if (!products.length) {
    console.log('No legacy test products found needing update.');
    return;
  }

  console.log(`Marking ${products.length} legacy test products as isTest=true`);
  for (const p of products) {
    await prisma.product.update({
      where: { id: p.id },
      data: { isTest: true },
    });
    console.log(`✔ Marked ${p.slug} (${p.title}) by ${p.seller.displayName}`);
  }

  console.log(
    'Done. These products will now be hidden by search/explore/featured queries.'
  );
}

markLegacyTestProducts()
  .catch(err => {
    console.error('Error marking legacy test products', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
