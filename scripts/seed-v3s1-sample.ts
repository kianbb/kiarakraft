/* V3-S1 sample seed: creates a seller with handle and 3 products for verification.
   Usage: npx ts-node --compiler-options '{"module":"commonjs"}' scripts/seed-v3s1-sample.ts
*/
import { prisma } from '../lib/prisma';
import { randomUUID } from 'crypto';

async function main() {
  const email = 'seller-v3s1@example.com';
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        password: 'dev-hash',
        role: 'SELLER',
        name: 'V3S1 Seller',
      },
    });
  }

  let profile = await prisma.sellerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) {
    profile = await prisma.sellerProfile.create({
      data: {
        userId: user.id,
        handle: 'v3s1-sample',
        shopName: 'V3S1 Sample Shop',
        displayName: 'V3S1 Sample',
        bio: 'Sample seeded seller for storefront verification.',
        avatarUrl: 'https://placehold.co/200x200',
        bannerUrl: 'https://placehold.co/1200x400',
        verified: true,
      },
    });
  }

  const existingProducts = await prisma.product.findMany({
    where: { sellerId: profile.id },
  });
  if (existingProducts.length < 3) {
    const toCreate = 3 - existingProducts.length;
    for (let i = 0; i < toCreate; i++) {
      const title = `Sample Product ${existingProducts.length + i + 1}`;
      await prisma.product.create({
        data: {
          sellerId: profile.id,
          title,
          slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`,
          description: 'Seed product for storefront test.',
          priceToman: 123000 + i * 10000,
          stock: 10,
          images: {
            create: [{ url: 'https://placehold.co/600x600', alt: title }],
          },
        },
      });
    }
  }

  console.log('Seeded V3-S1 sample seller at /fa/shop/v3s1-sample');
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
