import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking current SellerProfile data...');

  const sellers = await prisma.sellerProfile.findMany({
    select: {
      id: true,
      shopName: true,
      displayName: true,
      verified: true,
    },
  });

  console.log(`Found ${sellers.length} sellers:`);
  sellers.forEach(seller => {
    console.log(
      `- ID: ${seller.id.substring(0, 8)}..., Shop: "${seller.shopName}", Display: "${seller.displayName}", Verified: ${seller.verified}`
    );
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
