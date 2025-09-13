import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkKianStoreProducts() {
  try {
    // Find kian store seller profile
    const kianStore = await prisma.sellerProfile.findFirst({
      where: {
        shopName: 'kian store',
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!kianStore) {
      console.log('❌ Kian store not found');
      return;
    }

    console.log('Found kian store:');
    console.log(`  Shop: ${kianStore.shopName}`);
    console.log(`  Email: ${kianStore.user.email}`);
    console.log(`  Verified: ${kianStore.verified}`);
    console.log(`  Verified At: ${kianStore.verifiedAt}`);
    console.log(`  Verified By: ${kianStore.verifiedBy}`);

    // Find all products for kian store
    const products = await prisma.product.findMany({
      where: {
        sellerId: kianStore.id,
      },
      select: {
        id: true,
        title: true,
        active: true,
        isTest: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log(`\nProducts (${products.length} total):`);
    for (const product of products) {
      console.log(`  - ${product.title}`);
      console.log(`    ID: ${product.id}`);
      console.log(`    Active: ${product.active}`);
      console.log(`    IsTest: ${product.isTest}`);
      console.log(`    Created: ${product.createdAt}`);
      console.log(`    Updated: ${product.updatedAt}`);

      // Fix isTest if needed
      if (product.isTest === true) {
        console.log('    ⚠️  Product marked as test - fixing...');
        await prisma.product.update({
          where: { id: product.id },
          data: { isTest: false },
        });
        console.log('    ✅ Fixed isTest to false');
      }

      // Fix active if needed
      if (product.active === false && kianStore.verified) {
        console.log(
          '    ⚠️  Product inactive but seller is verified - fixing...'
        );
        await prisma.product.update({
          where: { id: product.id },
          data: { active: true },
        });
        console.log('    ✅ Fixed active to true');
      }
    }

    console.log('\n✨ Check complete!');
  } catch (error) {
    console.error('❌ Error checking kian store products:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkKianStoreProducts();
