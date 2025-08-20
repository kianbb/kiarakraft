import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Curated, category-aligned Unsplash URLs (stable enough for placeholders)
const CATEGORY_URLS: Record<string, string[]> = {
  ceramics: [
    'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800&h=800&fit=crop&q=80',
    'https://images.unsplash.com/photo-1611309454922-3a9a160a2a20?w=800&h=800&fit=crop&q=80'
  ],
  textiles: [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=800&fit=crop&q=80',
    'https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=800&h=800&fit=crop&q=80'
  ],
  jewelry: [
    'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&h=800&fit=crop&q=80',
    'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=800&h=800&fit=crop&q=80'
  ],
  woodwork: [
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=800&fit=crop&q=80',
    'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800&h=800&fit=crop&q=80'
  ],
  painting: [
    'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800&h=800&fit=crop&q=80',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&h=800&fit=crop&q=80'
  ],
};

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

async function main() {
  console.log('📷 Filling missing images with curated Unsplash URLs (one-off, no AI)...');

  // Join to read category slug; avoid N+1 lookups by selecting fields
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      images: true,
      category: { select: { slug: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  let created = 0;
  for (const p of products) {
    if (p.images.length > 0) continue;
    const slug = p.category?.slug || '';
    const bucket = CATEGORY_URLS[slug];
    if (!bucket || bucket.length === 0) continue;
    const url = pick(bucket);

    await prisma.listingImage.create({
      data: { productId: p.id, url, alt: p.title, sortOrder: 0 }
    });
    created++;
    console.log(`+ ${p.title}`);
  }

  console.log(`\n✅ Added images for ${created} products.`);
}

main().finally(() => prisma.$disconnect());
