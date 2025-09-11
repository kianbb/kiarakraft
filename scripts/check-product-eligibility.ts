import { PrismaClient, Product } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProductEligibility() {
  try {
    // Find the kian store product
    const product = await prisma.product.findFirst({
      where: {
        title: 'کلاه قرمزی',
        seller: {
          shopName: 'kian store',
        },
      },
      include: {
        seller: {
          select: {
            shopName: true,
            verified: true,
          },
        },
      },
    });

    if (!product) {
      console.log('Product not found');
      return;
    }

    console.log('Product Details:');
    console.log(`  ID: ${product.id}`);
    console.log(`  Title: ${product.title}`);
    console.log(`  Active: ${product.active}`);
    console.log(`  IsTest: ${product.isTest}`);
    console.log(
      `  Seller: ${product.seller.shopName} (Verified: ${product.seller.verified})`
    );

    // Check if eligibilityStatus exists
    const productWithAll = product as Product & { eligibilityStatus?: string };
    console.log(
      `  Eligibility Status: ${productWithAll.eligibilityStatus || 'NOT SET'}`
    );

    // Check all fields that might affect visibility
    console.log('\nAll product fields:');
    Object.keys(product).forEach(key => {
      const value = (product as Record<string, unknown>)[key];
      if (typeof value !== 'object' || value === null) {
        console.log(`  ${key}: ${value}`);
      }
    });

    // Check if product appears in API response
    console.log('\nChecking API response...');
    const response = await fetch(
      'http://localhost:3000/api/products?locale=fa'
    );
    const products = await response.json();
    const foundInApi = products.some(
      (p: { id: string }) => p.id === product.id
    );
    console.log(`Product appears in API: ${foundInApi}`);

    if (!foundInApi) {
      console.log('\n⚠️  Product is NOT in API response - likely filtered out');

      // Check the specific product by fetching it directly
      const directProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });

      console.log('\nDirect database query result:');
      console.log(JSON.stringify(directProduct, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProductEligibility();
