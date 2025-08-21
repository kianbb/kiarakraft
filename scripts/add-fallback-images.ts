import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fallback to local placeholder images if external URLs fail
const categoryFallbacks: Record<string, string> = {
  'سرامیک / Ceramics': '/placeholder-ceramics.jpg',
  'نساجی / Textiles': '/placeholder-textiles.jpg',
  'جواهرات / Jewelry': '/placeholder-jewelry.jpg',
  'صنایع چوبی / Woodwork': '/placeholder-woodwork.jpg',
  'نقاشی / Painting': '/placeholder-painting.jpg',
};

async function addFallbackSupport() {
  console.log('🛡️ Adding fallback image support...');

  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      include: {
        images: true,
        category: true,
      },
    });

    let updatedCount = 0;

    for (const product of products) {
      // If product has no images or broken images, add category fallback
      if (product.images.length === 0 && product.category) {
        const fallbackUrl =
          categoryFallbacks[product.category.name] || '/kk-logo-original.png';

        await prisma.listingImage.create({
          data: {
            productId: product.id,
            url: fallbackUrl,
            alt: `${product.title} - صورت پیش‌فرض`,
            sortOrder: 0,
          },
        });

        console.log(`✅ Added fallback for: ${product.title}`);
        updatedCount++;
      }
    }

    console.log(`\n🎉 Added fallback images for ${updatedCount} products`);
  } catch (error) {
    console.error('❌ Error adding fallback images:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addFallbackSupport();
