import { prisma } from '../lib/prisma';

async function removeTestProducts() {
  try {
    // Find products that match test patterns
    const testProducts = await prisma.product.findMany({
      where: {
        OR: [
          { slug: { startsWith: 'test-' } },
          { slug: { startsWith: 'search-ceramic-bowl-' } },
          { seller: { shopName: 'Test Shop' } },
          { seller: { displayName: 'Test Seller' } },
          { seller: { displayName: 'Test Search Seller' } },
          { seller: { displayName: 'Search Test Seller' } },
          { seller: { shopName: { contains: 'Test', mode: 'insensitive' } } },
          {
            seller: { displayName: { contains: 'test', mode: 'insensitive' } },
          },
        ],
      },
      include: {
        seller: true,
        translations: true,
        images: true,
      },
    });

    console.log(`Found ${testProducts.length} test products to remove:`);
    testProducts.forEach(product => {
      console.log(
        `- ${product.title} (${product.slug}) by ${product.seller.displayName}`
      );
    });

    if (testProducts.length === 0) {
      console.log('No test products found to remove.');
      return;
    }

    // Remove products and their related data
    for (const product of testProducts) {
      console.log(`Removing product: ${product.title} (${product.slug})`);

      // Delete order items first (if any)
      await prisma.orderItem.deleteMany({
        where: { productId: product.id },
      });

      // Delete cart items
      await prisma.cartItem.deleteMany({
        where: { productId: product.id },
      });

      // Delete translations
      await prisma.productTranslation.deleteMany({
        where: { productId: product.id },
      });

      // Delete images
      await prisma.listingImage.deleteMany({
        where: { productId: product.id },
      });

      // Delete the product
      await prisma.product.delete({
        where: { id: product.id },
      });
    }

    console.log(`✅ Successfully removed ${testProducts.length} test products`);

    // Also find and remove test sellers without products
    const testSellers = await prisma.sellerProfile.findMany({
      where: {
        OR: [
          { shopName: 'Test Shop' },
          { displayName: 'Test Seller' },
          { displayName: 'Test Search Seller' },
          { displayName: 'Search Test Seller' },
          { shopName: { contains: 'Test', mode: 'insensitive' } },
          { displayName: { contains: 'test', mode: 'insensitive' } },
        ],
        products: { none: {} }, // Only sellers with no products
      },
      include: {
        user: true,
      },
    });

    console.log(
      `Found ${testSellers.length} test sellers with no products to remove:`
    );

    for (const seller of testSellers) {
      console.log(
        `Removing seller: ${seller.displayName} (${seller.shopName})`
      );

      // Delete seller profile
      await prisma.sellerProfile.delete({
        where: { id: seller.id },
      });

      // Delete user account
      await prisma.user.delete({
        where: { id: seller.userId },
      });
    }

    console.log(`✅ Successfully removed ${testSellers.length} test sellers`);
  } catch (error) {
    console.error('❌ Error removing test products:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

removeTestProducts();
