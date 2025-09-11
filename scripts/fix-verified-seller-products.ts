import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixVerifiedSellerProducts() {
  try {
    // Find all verified sellers
    const verifiedSellers = await prisma.sellerProfile.findMany({
      where: {
        verified: true,
      },
      select: {
        id: true,
        shopName: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    console.log(`Found ${verifiedSellers.length} verified sellers`);

    for (const seller of verifiedSellers) {
      // Activate all inactive products for this verified seller
      const result = await prisma.product.updateMany({
        where: {
          sellerId: seller.id,
          active: false,
        },
        data: {
          active: true,
        },
      });

      if (result.count > 0) {
        console.log(
          `✅ Activated ${result.count} products for ${seller.shopName} (${seller.user.email})`
        );
      } else {
        console.log(
          `ℹ️  No inactive products found for ${seller.shopName} (${seller.user.email})`
        );
      }
    }

    console.log('\n✨ All verified seller products have been activated!');
  } catch (error) {
    console.error('❌ Error fixing verified seller products:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixVerifiedSellerProducts();
