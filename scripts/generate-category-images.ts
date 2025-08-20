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

  const categories = await prisma.category.findMany({ select: { id: true, name: true, slug: true } });

  for (const c of categories) {
    const title = c.name;
    const description = `Representative hero image for the ${c.name} category in an Iranian handmade marketplace.`;
    try {
      const buf = await generateProductImageBuffer({ title, description, category: c.slug });
      const upload = await uploadImageToCloudinary(buf, {
        folder: `kiarakraft/categories`,
        public_id: c.slug,
        width: 512,
        height: 512,
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
