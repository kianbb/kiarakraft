import { prisma } from '../lib/prisma';

async function fixSellerProducts() {
  console.log('Checking for products with incorrect sellerId...');

  // Find all products
  const products = await prisma.product.findMany({
    select: {
      id: true,
      title: true,
      sellerId: true,
    },
  });

  console.log(`Found ${products.length} total products`);

  // Find all seller profiles
  const sellerProfiles = await prisma.sellerProfile.findMany({
    include: {
      user: true,
    },
  });

  const sellerProfileMap = new Map(
    sellerProfiles.map(sp => [sp.userId, sp.id])
  );

  let fixedCount = 0;
  const issues = [];

  for (const product of products) {
    // Check if the sellerId looks like a user ID (not a seller profile ID)
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { id: product.sellerId },
    });

    if (!sellerProfile) {
      // This sellerId doesn't match any seller profile
      // Check if it matches a user ID instead
      const user = await prisma.user.findUnique({
        where: { id: product.sellerId },
        include: { sellerProfile: true },
      });

      if (user && user.sellerProfile) {
        issues.push({
          productId: product.id,
          productTitle: product.title,
          incorrectSellerId: product.sellerId,
          correctSellerId: user.sellerProfile.id,
          userEmail: user.email,
        });

        // Fix the sellerId
        await prisma.product.update({
          where: { id: product.id },
          data: { sellerId: user.sellerProfile.id },
        });

        fixedCount++;
        console.log(`Fixed product "${product.title}" (${product.id})`);
      } else {
        console.warn(
          `Product "${product.title}" (${product.id}) has invalid sellerId: ${product.sellerId}`
        );
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total products checked: ${products.length}`);
  console.log(`Products fixed: ${fixedCount}`);

  if (issues.length > 0) {
    console.log('\nFixed issues:');
    issues.forEach(issue => {
      console.log(`- Product: ${issue.productTitle}`);
      console.log(`  Old sellerId (user.id): ${issue.incorrectSellerId}`);
      console.log(
        `  New sellerId (sellerProfile.id): ${issue.correctSellerId}`
      );
      console.log(`  User email: ${issue.userEmail}`);
      console.log('');
    });
  }
}

fixSellerProducts()
  .then(() => {
    console.log('✅ Fix completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error fixing products:', error);
    process.exit(1);
  });
