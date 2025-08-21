import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { PrismaClient } from '@prisma/client';
import { uploadImageToCloudinary } from '@/lib/cloudinary';
import { CATEGORY_IMAGE_FALLBACKS } from '@/lib/assets';

const prisma = new PrismaClient();

// Curated, category-aligned Unsplash URLs
const CATEGORY_URLS: Record<string, string[]> = {
  ceramics: [
    'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=1200&h=1200&fit=crop&q=85',
    'https://images.unsplash.com/photo-1611309454922-3a9a160a2a20?w=1200&h=1200&fit=crop&q=85',
  ],
  textiles: [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=1200&fit=crop&q=85',
    'https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=1200&h=1200&fit=crop&q=85',
  ],
  jewelry: [
    'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1200&h=1200&fit=crop&q=85',
    'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=1200&h=1200&fit=crop&q=85',
  ],
  woodwork: [
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200&h=1200&fit=crop&q=85',
    'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=1200&h=1200&fit=crop&q=85',
  ],
  painting: [
    'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=1200&h=1200&fit=crop&q=85',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&h=1200&fit=crop&q=85',
  ],
};

function stablePick<T>(arr: T[], key: string): T {
  let hash = 0;
  for (let i = 0; i < key.length; i++)
    hash = (hash << 5) - hash + key.charCodeAt(i);
  const idx = Math.abs(hash) % Math.max(1, arr.length);
  return arr[idx];
}

async function fetchImageBuffer(
  url: string,
  timeoutMs = 10000
): Promise<Buffer> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const resp = await fetch(url, {
    signal: ctrl.signal,
    headers: { 'User-Agent': 'KiaraKraft-Script/1.0' },
  });
  clearTimeout(t);
  if (!resp.ok) throw new Error(`fetch ${resp.status}`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

function buildCandidateUrls(
  slug: string,
  bucket: string[] | undefined,
  key: string
): string[] {
  const candidates: string[] = [];
  if (bucket && bucket.length) {
    // Prefer stable pick first, then fall back to the rest in order
    const picked = stablePick(bucket, key);
    candidates.push(picked);
    for (const u of bucket) if (u !== picked) candidates.push(u);
  }
  // Last-resort fallback per category from assets.ts (Unsplash or Cloudinary if configured)
  const categoryFallback = CATEGORY_IMAGE_FALLBACKS[slug];
  if (categoryFallback) candidates.push(categoryFallback);
  // De-duplicate while preserving order
  return Array.from(new Set(candidates));
}

async function main() {
  console.log(
    '🔄 Replacing product images with curated Cloudinary-hosted images...'
  );

  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      images: true,
      category: { select: { slug: true } },
      translations: { where: { locale: 'en' } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let replaced = 0;
  for (const p of products) {
    const slug = p.category?.slug || '';
    const bucket = CATEGORY_URLS[slug];
    if (!bucket || bucket.length === 0) {
      console.log(`(no-bucket) Will try category fallback for slug: ${slug}`);
    }

    try {
      const enTitle = p.translations?.[0]?.title || p.title;
      const candidates = buildCandidateUrls(slug, bucket, enTitle);
      console.log(`→ ${p.title}`);

      let buf: Buffer | null = null;
      let usedUrl: string | undefined;
      let lastErr: unknown;
      for (const url of candidates) {
        try {
          buf = await fetchImageBuffer(url);
          usedUrl = url;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!buf) throw lastErr || new Error('No candidate image succeeded');

      // Upload to Cloudinary as main image (with a simple retry for transient errors)
      const upload = await (async () => {
        const opts = {
          folder: `kiarakraft/products/${p.id}`,
          public_id: 'main',
          width: 1024,
          height: 1024,
          crop: 'fill' as const,
        };
        let lastErr: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            return await uploadImageToCloudinary(buf, opts);
          } catch (e) {
            lastErr = e;
            if (attempt < 3)
              await new Promise(r => setTimeout(r, 400 * attempt));
          }
        }
        throw lastErr;
      })();

      // Replace existing images
      await prisma.listingImage.deleteMany({ where: { productId: p.id } });
      await prisma.listingImage.create({
        data: {
          productId: p.id,
          url: upload.secure_url,
          alt: enTitle,
          sortOrder: 0,
        },
      });

      replaced++;
      if (usedUrl) console.log(`   ✓ from ${usedUrl}`);
    } catch (e) {
      console.error(`✗ Failed for ${p.title}:`, e);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n✅ Replaced images for ${replaced} products.`);
}

main().finally(() => prisma.$disconnect());
