import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSellerIds() {
  try {
    // Find all sellers with 'kian' in their shop name
    const sellers = await prisma.sellerProfile.findMany({
      where: {
        shopName: {
          contains: 'kian',
          mode: 'insensitive',
        },
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
        products: {
          select: {
            id: true,
            title: true,
            active: true,
            isTest: true,
          },
        },
      },
    });

    console.log(
      `Found ${sellers.length} seller(s) with 'kian' in shop name:\n`
    );

    for (const seller of sellers) {
      console.log(`Seller ID: ${seller.id}`);
      console.log(`Shop Name: ${seller.shopName}`);
      console.log(`Email: ${seller.user.email}`);
      console.log(`Verified: ${seller.verified}`);
      console.log(`Products (${seller.products.length}):`);
      for (const product of seller.products) {
        console.log(
          `  - ${product.title} (ID: ${product.id}, Active: ${product.active}, IsTest: ${product.isTest})`
        );
      }
      console.log('---');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSellerIds();
