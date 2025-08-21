import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { PrismaClient } from '@prisma/client';
import { uploadImageToCloudinary } from '@/lib/cloudinary';
import { generateProductImageBuffer } from '@/lib/image-gen';

const prisma = new PrismaClient();

async function main() {
  if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY_BETA) {
    throw new Error('Missing OPENAI_API_KEY');
  }
  console.log('🎨 Generating category images...');

  const categories = await prisma.category.findMany({
    select: { id: true, name: true, slug: true },
  });

  for (const c of categories) {
    // Derive a clean English title from name and slug
    const nameParts = c.name.split('/').map(s => s.trim());
    const englishFromName =
      nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined;
    const fallbackBySlug: Record<string, string> = {
      ceramics: 'Ceramics',
      textiles: 'Textiles',
      jewelry: 'Jewelry',
      woodwork: 'Woodwork',
      painting: 'Painting',
    };
    const title = englishFromName || fallbackBySlug[c.slug] || c.name;
    const description = `Category hero image for ${title}. Clean studio white background, square, high-quality, no text or watermarks.`;
    try {
      const buf = await (async () => {
        let lastErr: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            return await generateProductImageBuffer({
              title,
              description,
              category: c.slug,
              size: '1024x1024',
            });
          } catch (e) {
            lastErr = e;
            if (attempt < 3)
              await new Promise(r => setTimeout(r, 500 * attempt));
          }
        }
        throw lastErr;
      })();
      const upload = await uploadImageToCloudinary(buf, {
        folder: `kiarakraft/categories`,
        public_id: c.slug,
        width: 800,
        height: 800,
        crop: 'fill',
      });
      console.log(`✅ ${c.slug} -> ${upload.secure_url}`);
    } catch (e) {
      console.error(`✗ Failed ${c.slug}:`, e);
    }
    await new Promise(r => setTimeout(r, 400));
  }

  console.log('Done.');
}

main().finally(() => prisma.$disconnect());
