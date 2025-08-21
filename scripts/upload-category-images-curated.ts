import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { PrismaClient } from '@prisma/client';
import { uploadImageToCloudinary } from '@/lib/cloudinary';
import { CATEGORY_IMAGE_FALLBACKS } from '@/lib/assets';

const prisma = new PrismaClient();

// Curated Unsplash URLs per category slug
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

async function main() {
  console.log('🔄 Uploading curated category images to Cloudinary...');

  const categories = await prisma.category.findMany({
    select: { id: true, slug: true, name: true },
  });
  let uploaded = 0,
    skipped = 0;
  for (const c of categories) {
    const bucket = CATEGORY_URLS[c.slug];
    if (!bucket || !bucket.length) {
      console.log(`(skip) No curated mapping for category: ${c.slug}`);
      skipped++;
      continue;
    }

    try {
      const stable = stablePick(bucket, c.slug);
      const candidates = [
        stable,
        ...bucket.filter(u => u !== stable),
        CATEGORY_IMAGE_FALLBACKS[c.slug],
      ].filter(Boolean) as string[];
      console.log(`→ ${c.name} (${c.slug})`);
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
      // Public ID equals slug so lib/assets.ts URLs resolve
      await uploadImageToCloudinary(buf, {
        folder: 'kiarakraft/categories',
        public_id: c.slug,
        width: 800,
        height: 800,
        crop: 'fill',
      });
      uploaded++;
      if (usedUrl) console.log(`   ✓ from ${usedUrl}`);
    } catch (e) {
      console.error(`✗ Failed for ${c.slug}:`, e);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n✅ Uploaded ${uploaded} category images. Skipped ${skipped}.`);
}

main().finally(() => prisma.$disconnect());
