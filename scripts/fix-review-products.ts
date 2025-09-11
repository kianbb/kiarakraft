import { PrismaClient } from '@prisma/client';
import {
  assessProductWithAI,
  assessProductForHandcrafted,
} from '@/lib/moderation-ai';

const prisma = new PrismaClient();

async function fixReviewProducts() {
  try {
    console.log('🔍 Finding products with REVIEW status...');

    // Find all products with REVIEW status
    const reviewProducts = await prisma.product.findMany({
      where: {
        eligibilityStatus: 'REVIEW',
      },
      include: {
        images: {
          select: {
            url: true,
          },
          take: 1,
        },
        category: {
          select: {
            slug: true,
          },
        },
      },
    });

    console.log(`Found ${reviewProducts.length} products in REVIEW status`);

    if (reviewProducts.length === 0) {
      console.log('✅ No products need re-evaluation');
      return;
    }

    let approved = 0;
    let rejected = 0;
    let errors = 0;

    for (const product of reviewProducts) {
      try {
        console.log(`\nEvaluating: ${product.title} (ID: ${product.id})`);

        // Use AI assessment if image is available, otherwise use keyword-based
        const result =
          product.images.length > 0
            ? await assessProductWithAI({
                title: product.title,
                description: product.description,
                imageUrl: product.images[0].url,
                categorySlug: product.category?.slug,
                price: product.priceToman,
              })
            : await assessProductForHandcrafted({
                title: product.title,
                description: product.description,
                categorySlug: product.category?.slug,
              });

        // Update the product with the new status
        await prisma.product.update({
          where: { id: product.id },
          data: {
            eligibilityStatus: result.status,
            eligibilityConfidence: result.confidence || null,
            eligibilityReasons:
              result.reasons?.join('; ').slice(0, 1000) || null,
          },
        });

        console.log(
          `  ✅ Updated to ${result.status} (confidence: ${result.confidence}%)`
        );
        if (result.reasons && result.reasons.length > 0) {
          console.log(`  Reasons: ${result.reasons.join(', ')}`);
        }

        if (result.status === 'APPROVED') {
          approved++;
        } else {
          rejected++;
        }
      } catch (error) {
        console.error(`  ❌ Error evaluating product ${product.id}:`, error);
        errors++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`  ✅ Approved: ${approved}`);
    console.log(`  ❌ Rejected: ${rejected}`);
    console.log(`  ⚠️  Errors: ${errors}`);
    console.log(`\n✨ Re-evaluation complete!`);
  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Also create a function to check a specific product
async function checkSpecificProduct(productId?: string) {
  try {
    const whereClause = productId
      ? { id: productId }
      : {
          title: 'کلاه قرمزی',
          seller: {
            shopName: 'kian store',
          },
        };

    const product = await prisma.product.findFirst({
      where: whereClause,
      include: {
        images: {
          select: {
            url: true,
          },
          take: 1,
        },
        category: {
          select: {
            slug: true,
          },
        },
        seller: {
          select: {
            shopName: true,
          },
        },
      },
    });

    if (!product) {
      console.log('Product not found');
      return;
    }

    console.log(`\n🔍 Checking product: ${product.title}`);
    console.log(`   Shop: ${product.seller.shopName}`);
    console.log(`   Current status: ${product.eligibilityStatus}`);
    console.log(`   Has image: ${product.images.length > 0 ? 'Yes' : 'No'}`);

    // Re-evaluate the product
    const result =
      product.images.length > 0
        ? await assessProductWithAI({
            title: product.title,
            description: product.description,
            imageUrl: product.images[0].url,
            categorySlug: product.category?.slug,
            price: product.priceToman,
          })
        : await assessProductForHandcrafted({
            title: product.title,
            description: product.description,
            categorySlug: product.category?.slug,
          });

    console.log(`\n📋 New evaluation:`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Confidence: ${result.confidence}%`);
    if (result.reasons && result.reasons.length > 0) {
      console.log(`   Reasons: ${result.reasons.join(', ')}`);
    }

    // Update the product
    await prisma.product.update({
      where: { id: product.id },
      data: {
        eligibilityStatus: result.status,
        eligibilityConfidence: result.confidence || null,
        eligibilityReasons: result.reasons?.join('; ').slice(0, 1000) || null,
      },
    });

    console.log('\n✅ Product updated successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Check command line arguments
const args = process.argv.slice(2);
if (args[0] === '--product' && args[1]) {
  // Check specific product by ID
  checkSpecificProduct(args[1]);
} else if (args[0] === '--kian') {
  // Check kian store product specifically
  checkSpecificProduct();
} else {
  // Fix all review products
  fixReviewProducts();
}
