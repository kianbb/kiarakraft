import { config as loadEnv } from 'dotenv';
// Prefer .env.local if present, then fallback to .env
loadEnv({ path: '.env.local' });
loadEnv();
import { PrismaClient } from '@prisma/client';
import { uploadImageToCloudinary } from '@/lib/cloudinary';
import { generateProductImageBuffer, inferCategoryFromSlugOrName } from '@/lib/image-gen';

const prisma = new PrismaClient();

type Options = {
  replace?: boolean; // delete existing images
  onlyMissing?: boolean; // only products without images
  limit?: number; // process only N products
  dryRun?: boolean;
};

function envGuard() {
  if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY_BETA) {
    throw new Error('Missing OPENAI_API_KEY. Set it to enable AI image generation.');
  }
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET || !process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
    throw new Error('Missing Cloudinary env vars (CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME).');
  }
}

async function main(opts: Options) {
  if (!opts.dryRun) envGuard();
  console.log('🖼️  Generating product images...', opts);

  const where: any = { active: true };
  const products = await prisma.product.findMany({
    where,
    include: {
      images: true,
      category: { select: { slug: true, name: true } },
      translations: { where: { locale: 'en' } }
    },
    orderBy: { createdAt: 'asc' },
    take: opts.limit,
  });

  let processed = 0;
  for (const p of products) {
    if (opts.onlyMissing && p.images.length > 0) continue;
    if (!opts.replace && p.images.some(img => img.url.includes('res.cloudinary.com'))) continue; // already have cloudinary

  const category = inferCategoryFromSlugOrName(p.category?.slug || p.category?.name);
  const enTitle = p.translations?.[0]?.title || p.title;
  const enDescription = p.translations?.[0]?.description || p.description;

    try {
      console.log(`→ ${enTitle}`);
      if (opts.dryRun) {
        processed++;
        continue;
      }
      // OpenAI call with simple retry (3 attempts)
      const buf = await (async () => {
        let lastErr: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            return await generateProductImageBuffer({ title: enTitle, description: enDescription, category, size: '1024x1024' });
          } catch (e) {
            lastErr = e;
            if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
          }
        }
        throw lastErr;
      })();
      const upload = await uploadImageToCloudinary(buf, {
        folder: `kiarakraft/products/${p.id}`,
        public_id: 'main',
        width: 1024,
        height: 1024,
        crop: 'fill',
      });

      if (opts.replace) {
        await prisma.listingImage.deleteMany({ where: { productId: p.id } });
      }

      // ensure sortOrder 0 is new main image
      await prisma.listingImage.create({
        data: {
          productId: p.id,
          url: upload.secure_url,
          alt: enTitle,
          sortOrder: 0,
        }
      });

      // normalize others to start at 1 (only when not replacing)
      if (!opts.replace) {
        const others = p.images;
        for (let i = 0; i < others.length; i++) {
          await prisma.listingImage.update({
            where: { id: others[i].id },
            data: { sortOrder: i + 1 }
          });
        }
      }

      processed++;
    } catch (e) {
      console.error(`✗ Failed for ${p.title}:`, e);
    }

    // tiny delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✅ Done. Processed ${processed} products.`);
}

// Parse simple flags from CLI
const args = new Set(process.argv.slice(2));
main({
  replace: args.has('--replace'),
  onlyMissing: args.has('--only-missing'),
  dryRun: args.has('--dry-run'),
  limit: (() => {
    const l = process.argv.find(a => a.startsWith('--limit='));
    return l ? parseInt(l.split('=')[1]) : undefined;
  })()
}).finally(() => prisma.$disconnect());
