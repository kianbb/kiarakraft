#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();

async function watchProductStatus() {
  console.log('🔍 Watching Product Status Updates\n');

  // Get product ID from command line argument
  const productId = process.argv[2];

  if (!productId) {
    // Watch all PENDING products
    console.log('Watching all PENDING products...\n');

    while (true) {
      const pendingProducts = await prisma.product.findMany({
        where: { eligibilityStatus: 'PENDING' },
        select: {
          id: true,
          title: true,
          eligibilityStatus: true,
          eligibilityReasons: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (pendingProducts.length > 0) {
        console.clear();
        console.log(`📊 PENDING Products: ${pendingProducts.length}\n`);

        for (const product of pendingProducts) {
          console.log(`ID: ${product.id}`);
          console.log(`Title: ${product.title}`);
          console.log(`Status: ${product.eligibilityStatus}`);
          console.log(
            `Reasons: ${product.eligibilityReasons?.substring(0, 100)}...`
          );
          console.log(`Updated: ${product.updatedAt.toLocaleTimeString()}`);
          console.log('---');
        }
      } else {
        console.log('No PENDING products found.');
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } else {
    // Watch specific product
    console.log(`Watching product ${productId}...\n`);

    let lastStatus = '';
    let lastReasons = '';

    while (true) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          title: true,
          eligibilityStatus: true,
          eligibilityReasons: true,
          eligibilityConfidence: true,
          updatedAt: true,
        },
      });

      if (!product) {
        console.log(`Product ${productId} not found.`);
        break;
      }

      // Check if status or reasons changed
      if (
        product.eligibilityStatus !== lastStatus ||
        product.eligibilityReasons !== lastReasons
      ) {
        console.log(`\n[${new Date().toLocaleTimeString()}] Update detected:`);
        console.log(`Title: ${product.title}`);
        console.log(`Status: ${product.eligibilityStatus}`);

        if (product.eligibilityConfidence) {
          console.log(`Confidence: ${product.eligibilityConfidence}%`);
        }

        if (product.eligibilityReasons) {
          console.log(`\nReasons (raw):`);
          console.log(product.eligibilityReasons);

          // Try to parse as JSON
          try {
            const parsed = JSON.parse(product.eligibilityReasons);
            console.log(`\nReasons (parsed):`);
            console.log('English:', parsed.en);
            console.log('Persian:', parsed.fa);
          } catch (e) {
            // Not JSON, show as is
          }
        }

        lastStatus = product.eligibilityStatus || '';
        lastReasons = product.eligibilityReasons || '';

        // Stop watching if product is no longer PENDING
        if (product.eligibilityStatus !== 'PENDING') {
          console.log(`\n✅ Product processing complete!`);
          break;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

watchProductStatus()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
