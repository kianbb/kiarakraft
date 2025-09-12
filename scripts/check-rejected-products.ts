import { prisma } from '../lib/prisma';

async function checkRejectedProducts() {
  try {
    // Find rejected products
    const rejectedProducts = await prisma.product.findMany({
      where: {
        eligibilityStatus: 'REJECTED',
      },
      select: {
        id: true,
        title: true,
        description: true,
        eligibilityStatus: true,
        eligibilityReasons: true,
        eligibilityConfidence: true,
        createdAt: true,
        active: true,
        images: {
          select: {
            url: true,
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    console.log('\n=== REJECTED PRODUCTS ANALYSIS ===\n');
    console.log(`Found ${rejectedProducts.length} rejected products\n`);

    for (const product of rejectedProducts) {
      console.log('-------------------');
      console.log(`Title: ${product.title}`);
      console.log(`Status: ${product.eligibilityStatus}`);
      console.log(`Active: ${product.active}`);
      console.log(`Confidence: ${product.eligibilityConfidence}%`);
      console.log(
        `Reasons: ${product.eligibilityReasons || 'No reasons provided'}`
      );
      console.log(`Description: ${product.description.substring(0, 100)}...`);
      console.log(`Has Image: ${product.images.length > 0 ? 'Yes' : 'No'}`);
      console.log(`Created: ${product.createdAt.toISOString()}`);
      console.log('');
    }

    // Check overall statistics
    const stats = await prisma.product.groupBy({
      by: ['eligibilityStatus'],
      _count: {
        id: true,
      },
    });

    console.log('\n=== OVERALL PRODUCT STATUS STATISTICS ===\n');
    for (const stat of stats) {
      console.log(`${stat.eligibilityStatus}: ${stat._count.id} products`);
    }
  } catch (error) {
    console.error('Error checking products:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRejectedProducts();
