#!/usr/bin/env tsx
/**
 * Fix mixed language descriptions in products
 *
 * Problem: Product enhancement was concatenating English translations
 * to Persian descriptions, creating mixed-language content in a single field.
 *
 * Solution: Split the mixed content and store English in ProductTranslation table
 */

import { prisma } from '../lib/db';

async function fixMixedDescriptions() {
  console.log('🔍 Finding products with mixed language descriptions...\n');

  try {
    // Find all products with descriptions containing both Persian and English
    const products = await prisma.product.findMany({
      where: {
        AND: [
          { description: { contains: ' ' } }, // Has content
          { isTest: false }, // Not test products
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        slug: true,
      },
    });

    console.log(`Found ${products.length} products to check\n`);

    let fixedCount = 0;
    let alreadyFixedCount = 0;

    for (const product of products) {
      const description = product.description;

      // Check if description contains both Persian and English
      const hasPersian = /[\u0600-\u06FF]/.test(description);
      const hasEnglish = /[a-zA-Z]{2,}/.test(description);

      if (hasPersian && hasEnglish) {
        console.log(`\n📦 Product: ${product.title} (${product.slug})`);
        console.log(
          `   Mixed content detected (length: ${description.length})`
        );

        // Try to split by common patterns
        // Pattern 1: Look for a clear English section after Persian
        // Pattern 2: Look for paragraph breaks

        let persianPart = '';
        let englishPart = '';

        // Split by double newline or obvious language transition
        const paragraphs = description.split(/\n\n|\.\s+[A-Z]/);

        for (const para of paragraphs) {
          const isPersian = /[\u0600-\u06FF]/.test(para);
          const isEnglish = /^[A-Za-z\s]/.test(para.trim());

          if (isPersian && !isEnglish) {
            persianPart += (persianPart ? '\n\n' : '') + para.trim();
          } else if (isEnglish && !isPersian) {
            englishPart += (englishPart ? '\n\n' : '') + para.trim();
          } else if (isPersian && isEnglish) {
            // Mixed paragraph - try to split by sentence
            const sentences = para.split(/[.؟!]\s+/);
            for (const sentence of sentences) {
              if (/[\u0600-\u06FF]/.test(sentence)) {
                persianPart += (persianPart ? '. ' : '') + sentence.trim();
              } else if (/[a-zA-Z]/.test(sentence)) {
                englishPart += (englishPart ? '. ' : '') + sentence.trim();
              }
            }
          }
        }

        // Alternative split: Find where Persian ends and English begins
        if (!englishPart && hasEnglish) {
          // Look for the first continuous English sentence
          const match = description.match(
            /[A-Z][a-z].+[.!?](?:\s+[A-Z][a-z].+[.!?])*/
          );
          if (match) {
            const englishStart = description.indexOf(match[0]);
            persianPart = description.substring(0, englishStart).trim();
            englishPart = description.substring(englishStart).trim();
          }
        }

        if (persianPart && englishPart) {
          console.log(`   ✂️  Split into:`);
          console.log(
            `      Persian (${persianPart.length} chars): ${persianPart.substring(0, 50)}...`
          );
          console.log(
            `      English (${englishPart.length} chars): ${englishPart.substring(0, 50)}...`
          );

          // Check if translation already exists
          const existingTranslation =
            await prisma.productTranslation.findUnique({
              where: {
                productId_locale: {
                  productId: product.id,
                  locale: 'en',
                },
              },
            });

          if (existingTranslation) {
            console.log(`   ⚠️  Translation already exists, skipping`);
            alreadyFixedCount++;
          } else {
            // Update product with Persian only
            await prisma.product.update({
              where: { id: product.id },
              data: { description: persianPart },
            });

            // Create English translation
            await prisma.productTranslation.create({
              data: {
                productId: product.id,
                locale: 'en',
                title: product.title, // Will need proper translation later
                description: englishPart,
              },
            });

            console.log(
              `   ✅ Fixed! Persian saved to main, English to translation`
            );
            fixedCount++;
          }
        } else {
          console.log(`   ⚠️  Could not reliably split content`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   - ${fixedCount} products fixed`);
    console.log(`   - ${alreadyFixedCount} already had translations`);
    console.log(
      `   - ${products.length - fixedCount - alreadyFixedCount} unchanged`
    );

    if (fixedCount > 0) {
      console.log('\n✅ Mixed descriptions have been separated!');
      console.log('   Persian text remains in main description field');
      console.log('   English text moved to ProductTranslation table');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixMixedDescriptions().catch(console.error);
